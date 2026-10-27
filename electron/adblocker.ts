import { app, ipcMain, BrowserWindow, type Session, type WebContents } from 'electron';
import { FiltersEngine, Request } from '@ghostery/adblocker';
import { parse as parseDomain } from 'tldts-experimental';
import fetch from 'cross-fetch';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

let engineInstance: FiltersEngine | null = null;
let blockedAdsCount = 0;
let isEnabled = true;

/* ── Preferências (persistidas) ── */
interface AdblockSettings {
  enabled: boolean;
  /** Listas completas: também avisos de cookies e incômodos (Fanboy Annoyances) */
  annoyances: boolean;
  /** Esconde espaços de anúncios e roda os "scriptlets" anti-anti-adblock */
  cosmetic: boolean;
  /** Bloqueia janelas pop-up/pop-under de anúncios */
  popups: boolean;
}
let settings: AdblockSettings = { enabled: true, annoyances: false, cosmetic: true, popups: true };
let listsUpdatedAt = 0;
let updating: Promise<void> | null = null;
const LIST_MAX_AGE = 7 * 24 * 3600 * 1000;

const settingsFile = () => path.join(app.getPath('userData'), 'adblock-settings.json');
const cacheFile = () => path.join(app.getPath('userData'), settings.annoyances ? 'adblocker_engine_full.bin' : 'adblocker_engine.bin');

function loadSettings() {
  try {
    const raw = JSON.parse(fsSync.readFileSync(settingsFile(), 'utf8'));
    settings = { ...settings, ...raw };
  } catch {
    /* padrão */
  }
  isEnabled = settings.enabled;
}
function saveSettings() {
  try {
    fsSync.writeFileSync(settingsFile(), JSON.stringify({ ...settings, enabled: isEnabled }), 'utf8');
  } catch {
    /* ignore */
  }
}

const CUSTOM_AD_REGEX =
  /popunder|pemsrv|smartpop|mayzaent|greentrafsa|silent-basis|diagramjawlineunhappy|exoclick|syndication|blocked\.html/i;

function broadcastCount() {
  BrowserWindow.getAllWindows().forEach((win) => {
    try {
      win.webContents.send('adblock:count-updated', blockedAdsCount);
    } catch {}
  });
}

function toAdblockRequest(
  details: Electron.OnBeforeRequestListenerDetails | Electron.OnHeadersReceivedListenerDetails
) {
  const resourceType = (details.resourceType as any) || 'other';
  return Request.fromRawDetails(
    details.webContentsId
      ? {
          _originalRequestDetails: details,
          requestId: `${details.id}`,
          sourceUrl: details.referrer,
          tabId: details.webContentsId,
          type: resourceType,
          url: details.url,
        }
      : {
          _originalRequestDetails: details,
          requestId: `${details.id}`,
          sourceUrl: details.referrer,
          type: resourceType,
          url: details.url,
        }
  );
}

/**
 * Inicializa o motor de bloqueio de anúncios compatível com uBlock Origin, EasyList e EasyPrivacy.
 * Carrega a partir do cache em disco em ~30ms ou baixa as listas na primeira execução.
 */
async function downloadLists(): Promise<void> {
  const engine = settings.annoyances ? await FiltersEngine.fromPrebuiltFull(fetch) : await FiltersEngine.fromPrebuiltAdsAndTracking(fetch);
  engineInstance = engine;
  listsUpdatedAt = Date.now();
  try {
    await fs.writeFile(cacheFile(), Buffer.from(engine.serialize()));
  } catch (cacheErr) {
    console.warn('[Adblocker] Aviso ao gravar cache em disco:', cacheErr);
  }
}

/** Baixa as listas de novo (em segundo plano). */
export function updateFilterLists(): Promise<void> {
  if (!updating) {
    updating = downloadLists()
      .catch((err) => console.warn('[Adblocker] Falha ao atualizar listas:', err?.message || err))
      .finally(() => {
        updating = null;
      });
  }
  return updating;
}

export async function setupAdblocker(): Promise<void> {
  loadSettings();
  try {
    try {
      const file = cacheFile();
      const [buf, st] = await Promise.all([fs.readFile(file), fs.stat(file)]);
      engineInstance = FiltersEngine.deserialize(buf);
      listsUpdatedAt = st.mtimeMs;
      console.log('[Adblocker] Listas carregadas do cache.');
      // Listas com mais de 7 dias: atualiza em segundo plano
      if (Date.now() - st.mtimeMs > LIST_MAX_AGE) void updateFilterLists();
    } catch {
      console.log('[Adblocker] Baixando listas (uBlock Origin / EasyList / EasyPrivacy)...');
      await updateFilterLists();
    }
  } catch (err: any) {
    console.warn('[Adblocker] Falha ao inicializar motor de bloqueio de anúncios:', err?.message || err);
  }
}

/* ── Navegador integrado: aplica o bloqueio na sessão das páginas ── */

export function applyAdblockToSession(ses: Session) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!handleAdblockBeforeRequest(details, callback)) callback({});
  });
}

/** Pop-ups/pop-unders de anúncio abertos por window.open */
export function shouldBlockPopup(url: string, sourceUrl: string): boolean {
  if (!isEnabled || !settings.popups) return false;
  if (CUSTOM_AD_REGEX.test(url)) return countBlocked();
  if (!engineInstance) return false;
  try {
    // Domínios de anúncio das listas (testados como um iframe vindo da página de origem)
    const doc = Request.fromRawDetails({ url, sourceUrl, type: 'subFrame', requestId: 'popup' });
    if (engineInstance.match(doc).match) return countBlocked();
  } catch {
    /* ignore */
  }
  return false;
}

const countBlocked = () => {
  blockedAdsCount++;
  broadcastCount();
  return true;
};

const DOM_SCAN = `(() => {
  const c = new Set(), i = new Set(), h = new Set();
  const els = document.querySelectorAll('[id],[class],a[href]');
  for (let k = 0; k < els.length && k < 20000; k++) {
    const el = els[k];
    if (el.id) i.add(el.id);
    if (el.classList) el.classList.forEach((x) => c.add(x));
    if (el.tagName === 'A' && el.href) h.add(el.href);
  }
  return { classes: [...c].slice(0, 5000), ids: [...i].slice(0, 2000), hrefs: [...h].slice(0, 2000) };
})()`;

/** Esconde anúncios na página (regras cosméticas) e injeta os scriptlets das listas. */
async function injectCosmetics(contents: WebContents, firstRun: boolean) {
  if (!isEnabled || !settings.cosmetic || !engineInstance || contents.isDestroyed()) return;
  const url = contents.getURL();
  if (!/^https?:/i.test(url)) return;
  const parsed = parseDomain(url);
  const hostname = parsed.hostname || '';
  const domain = parsed.domain || '';
  const engine: any = engineInstance;
  try {
    if (firstRun) {
      const r = engine.getCosmeticsFilters({
        url,
        hostname,
        domain,
        getBaseRules: true,
        getInjectionRules: true,
        getExtendedRules: false,
        getRulesFromHostname: true,
        getRulesFromDOM: false,
      });
      if (r?.active === false) return;
      if (r?.styles) await contents.insertCSS(r.styles, { cssOrigin: 'user' });
      for (const script of r?.scripts || []) contents.executeJavaScript(script, true).catch(() => {});
    }
    // Regras genéricas que dependem das classes/ids presentes na página
    const dom = await contents.executeJavaScript(DOM_SCAN, true);
    if (contents.isDestroyed() || contents.getURL() !== url) return;
    const r2 = engine.getCosmeticsFilters({
      url,
      hostname,
      domain,
      classes: dom?.classes,
      ids: dom?.ids,
      hrefs: dom?.hrefs,
      getBaseRules: false,
      getInjectionRules: false,
      getExtendedRules: false,
      getRulesFromHostname: false,
      getRulesFromDOM: true,
    });
    if (r2?.styles) await contents.insertCSS(r2.styles, { cssOrigin: 'user' });
  } catch {
    /* página fechada ou navegando */
  }
}

/** Liga o bloqueio cosmético num <webview> do navegador integrado. */
export function attachCosmeticFiltering(contents: WebContents) {
  let timer: NodeJS.Timeout | null = null;
  contents.on('dom-ready', () => {
    void injectCosmetics(contents, true);
    // Conteúdo carregado depois (rolagem infinita, anúncios atrasados)
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void injectCosmetics(contents, false), 2500);
  });
  contents.on('destroyed', () => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Filtro unificado de rede para onBeforeRequest:
 * Combina regras regex customizadas para sites de vídeo/animes e o motor uBlock Origin.
 */
export function handleAdblockBeforeRequest(
  details: Electron.OnBeforeRequestListenerDetails,
  callback: (response: Electron.CallbackResponse) => void
): boolean {
  if (!isEnabled) {
    return false;
  }

  // 1. Checagem ultra-rápida de redes invasivas e popunders conhecidos
  if (CUSTOM_AD_REGEX.test(details.url)) {
    blockedAdsCount++;
    broadcastCount();
    callback({ cancel: true });
    return true;
  }

  // 2. Motor uBlock Origin / EasyList
  if (engineInstance) {
    const req = toAdblockRequest(details);

    // Não cancelar navegação no frame principal do usuário
    if (req.isMainFrame()) {
      return false;
    }

    if (req.type === 'other') {
      req.guessTypeOfRequest();
    }

    const { match, redirect } = engineInstance.match(req);

    if (redirect?.dataUrl) {
      callback({ redirectURL: redirect.dataUrl });
      return true;
    }

    if (match) {
      blockedAdsCount++;
      broadcastCount();
      callback({ cancel: true });
      return true;
    }
  }

  return false;
}

/**
 * Filtro unificado de headers para onHeadersReceived:
 * Remove cabeçalhos restritivos de CORS, CORP e X-Frame-Options para garantir
 * que players de vídeo embutidos e capas de mangás carreguem sem conflito.
 */
export function handleAdblockHeadersReceived(
  details: Electron.OnHeadersReceivedListenerDetails,
  callback: (response: Electron.HeadersReceivedResponse) => void
): void {
  const sanitizeHeaders = (origHeaders?: Record<string, string[]>) => {
    const responseHeaders = { ...(origHeaders || details.responseHeaders) };
    delete responseHeaders['cross-origin-resource-policy'];
    delete responseHeaders['Cross-Origin-Resource-Policy'];
    delete responseHeaders['cross-origin-embedder-policy'];
    delete responseHeaders['Cross-Origin-Embedder-Policy'];
    delete responseHeaders['content-security-policy'];
    delete responseHeaders['Content-Security-Policy'];
    delete responseHeaders['x-frame-options'];
    delete responseHeaders['X-Frame-Options'];
    responseHeaders['access-control-allow-origin'] = ['*'];
    return responseHeaders;
  };

  callback({ responseHeaders: sanitizeHeaders() });
}

export function getAdblockStatus() {
  return {
    enabled: isEnabled && !!engineInstance,
    blockedCount: blockedAdsCount,
  };
}

export function toggleAdblock(enable?: boolean) {
  isEnabled = enable !== undefined ? enable : !isEnabled;
  settings.enabled = isEnabled;
  saveSettings();
  return getAdblockStatus();
}

const fullSettings = () => ({
  ...settings,
  enabled: isEnabled,
  ready: !!engineInstance,
  updating: !!updating,
  listsUpdatedAt,
  blockedCount: blockedAdsCount,
});

export function registerAdblockIpcHandlers(): void {
  ipcMain.handle('adblock:getStatus', () => getAdblockStatus());
  ipcMain.handle('adblock:toggle', (_e, enable?: boolean) => toggleAdblock(enable));
  ipcMain.handle('adblock:getSettings', () => fullSettings());
  ipcMain.handle('adblock:setSettings', async (_e, patch: Partial<AdblockSettings>) => {
    const listsChanged = typeof patch?.annoyances === 'boolean' && patch.annoyances !== settings.annoyances;
    settings = {
      ...settings,
      ...(typeof patch?.annoyances === 'boolean' ? { annoyances: patch.annoyances } : {}),
      ...(typeof patch?.cosmetic === 'boolean' ? { cosmetic: patch.cosmetic } : {}),
      ...(typeof patch?.popups === 'boolean' ? { popups: patch.popups } : {}),
    };
    if (typeof patch?.enabled === 'boolean') isEnabled = patch.enabled;
    saveSettings();
    if (listsChanged) {
      // Usa o cache do outro conjunto de listas, se existir; senão baixa
      try {
        const file = cacheFile();
        const [buf, st] = await Promise.all([fs.readFile(file), fs.stat(file)]);
        engineInstance = FiltersEngine.deserialize(buf);
        listsUpdatedAt = st.mtimeMs;
      } catch {
        await updateFilterLists();
      }
    }
    return fullSettings();
  });
  ipcMain.handle('adblock:updateLists', async () => {
    await updateFilterLists();
    return fullSettings();
  });
}
