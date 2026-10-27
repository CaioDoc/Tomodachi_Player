// src/api/extensionAutoUpdate.ts
// Atualização automática das extensões de mangá e anime ao abrir o app.
//
// 1. Extensões do app (mangá e anime): baixa de novo o índice dos repositórios e atualiza
//    versão, nome, ícone e — principalmente — o domínio do site (que muda com frequência e
//    quebrava a leitura). O vínculo com as obras (sourceName) é preservado.
// 2. Extensões reais do Mihon no Suwayomi (se configurado): instala as atualizações pendentes.
//
// Pode ser desligado em Configurações → Repositórios de Extensões.

import { getInstalledExtensions, saveInstalledExtensions, type InstalledExtension } from './extensionRegistry';
import { loadRepos, writeCache } from './reposStore';
import { loadRepoIndex, type RepoExtension } from './repositories';
import { getSuwayomiConfig, testConnection, listExtensions, changeExtension } from './suwayomi';
import { t, tn } from '../i18n';
import { toast } from '../components/Feedback';

const KEY = 'tp_ext_autoupdate';
export const EXT_AUTOUPDATE_EVENT = 'tomodachi:ext-autoupdate';

export interface ExtUpdateChange {
  kind: 'manga' | 'anime' | 'suwayomi';
  name: string;
  from?: string;
  to?: string;
  /** Domínio do site mudou */
  domain?: { from: string; to: string };
}

export interface ExtAutoUpdateState {
  enabled: boolean;
  lastRun?: number;
  running?: boolean;
  lastChanges?: ExtUpdateChange[];
  lastErrors?: string[];
  checked?: number;
}

export function getExtAutoUpdateState(): ExtAutoUpdateState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { enabled: s.enabled !== false, ...s };
  } catch {
    return { enabled: true };
  }
}

function saveState(patch: Partial<ExtAutoUpdateState>) {
  const next = { ...getExtAutoUpdateState(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EXT_AUTOUPDATE_EVENT));
  } catch {
    /* ignore */
  }
}

export function setExtAutoUpdateEnabled(enabled: boolean) {
  saveState({ enabled });
}

const cleanDomain = (u?: string) =>
  (u || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();

/** Atualiza as extensões do app de um tipo (mangá ou anime) a partir dos repositórios. */
async function updateAppExtensions(kind: 'manga' | 'anime', changes: ExtUpdateChange[], errors: string[]): Promise<number> {
  const installed = getInstalledExtensions(kind);
  if (installed.length === 0) return 0;

  // Índices de todos os repositórios desse tipo (sempre baixados de novo)
  const byPkg = new Map<string, { ext: RepoExtension; repoUrl: string }>();
  const byName = new Map<string, { ext: RepoExtension; repoUrl: string }>();
  for (const repo of loadRepos(kind)) {
    try {
      const list = await loadRepoIndex(repo.url);
      writeCache(kind, repo.url, list);
      for (const ext of list) {
        const entry = { ext, repoUrl: repo.url };
        if (ext.pkg && !byPkg.has(ext.pkg)) byPkg.set(ext.pkg, entry);
        const n = (ext.name || '').toLowerCase().trim();
        if (n && !byName.has(n)) byName.set(n, entry);
      }
    } catch (err: any) {
      errors.push(t('Repositório {name}: {error}', { name: repo.label || repo.url, error: err?.message || String(err) }));
    }
  }
  if (byPkg.size === 0 && byName.size === 0) return installed.length;

  const all = getInstalledExtensions();
  let changed = false;
  const updated = all.map((inst): InstalledExtension => {
    if (!installed.some((i) => i.pkg === inst.pkg)) return inst;
    const hit = byPkg.get(inst.pkg) || byName.get((inst.name || '').toLowerCase().trim());
    if (!hit) return inst;
    const { ext, repoUrl } = hit;
    const newVersion = ext.versionName || ext.version || '';
    // Domínio da fonte desta extensão (procura a fonte com o mesmo nome, se houver várias)
    const source = ext.sources?.find((s) => s.name && s.name.toLowerCase() === (inst.sourceName || '').toLowerCase()) || ext.sources?.[0];
    const newDomain = cleanDomain(source?.baseUrl || ext.baseUrl);
    const oldDomain = cleanDomain(inst.baseUrl);

    const next: InstalledExtension = { ...inst };
    let touched = false;
    if (newVersion && newVersion !== inst.version) {
      if (inst.version) changes.push({ kind, name: inst.name, from: inst.version, to: newVersion });
      next.version = newVersion;
      touched = true;
    }
    if (newDomain && newDomain !== oldDomain) {
      changes.push({ kind, name: inst.name, domain: { from: oldDomain || '—', to: newDomain } });
      next.baseUrl = newDomain;
      touched = true;
    }
    if (ext.icon && ext.icon !== inst.icon) {
      next.icon = ext.icon;
      touched = true;
    }
    if (!inst.repoUrl) {
      next.repoUrl = repoUrl;
      touched = true;
    }
    if (!inst.type) {
      next.type = kind;
      touched = true;
    }
    if (touched) changed = true;
    return touched ? next : inst;
  });
  if (changed) saveInstalledExtensions(updated);
  return installed.length;
}

/** Instala as atualizações pendentes das extensões do Suwayomi (se o servidor estiver no ar). */
async function updateSuwayomi(changes: ExtUpdateChange[], errors: string[]): Promise<number> {
  const cfg = getSuwayomiConfig();
  if (!cfg) return 0;
  // O servidor pode estar iniciando junto com o app: espera até ~1 min
  let online = false;
  const tries = cfg.autoStart ? 12 : 1;
  for (let i = 0; i < tries && !online; i++) {
    try {
      await testConnection(cfg);
      online = true;
    } catch {
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (!online) return 0;
  try {
    const list = await listExtensions(true);
    const pending = list.filter((e) => e.isInstalled && e.hasUpdate);
    for (const ext of pending) {
      try {
        await changeExtension(ext.pkgName, 'update');
        changes.push({ kind: 'suwayomi', name: ext.name, from: ext.versionName });
      } catch (err: any) {
        errors.push(`Suwayomi · ${ext.name}: ${err?.message || err}`);
      }
    }
    return list.filter((e) => e.isInstalled).length;
  } catch (err: any) {
    errors.push(`Suwayomi: ${err?.message || err}`);
    return 0;
  }
}

let runningPromise: Promise<ExtUpdateChange[]> | null = null;

/** Verifica e aplica as atualizações. `silent`: só avisa se algo mudou. */
export function runExtensionUpdates(opts: { silent?: boolean } = {}): Promise<ExtUpdateChange[]> {
  if (runningPromise) return runningPromise;
  runningPromise = (async () => {
    saveState({ running: true });
    const changes: ExtUpdateChange[] = [];
    const errors: string[] = [];
    let checked = 0;
    try {
      checked += await updateAppExtensions('manga', changes, errors);
      checked += await updateAppExtensions('anime', changes, errors);
      checked += await updateSuwayomi(changes, errors);
    } finally {
      saveState({ running: false, lastRun: Date.now(), lastChanges: changes, lastErrors: errors, checked });
    }
    if (changes.length > 0) {
      const names = Array.from(new Set(changes.map((c) => c.name))).slice(0, 4).join(', ');
      toast.success(tn(new Set(changes.map((c) => c.name)).size, '{n} extensão atualizada', '{n} extensões atualizadas'), names);
    } else if (!opts.silent) {
      toast.info(
        checked > 0 ? t('Todas as extensões já estão atualizadas') : t('Nenhuma extensão instalada para atualizar'),
        errors.length ? t('Alguns repositórios não responderam.') : undefined
      );
    }
    return changes;
  })().finally(() => {
    runningPromise = null;
  });
  return runningPromise;
}

/** Chamado ao abrir o app: roda uma vez por sessão, alguns segundos depois de iniciar. */
export function initExtensionAutoUpdate() {
  if (getExtAutoUpdateState().running) saveState({ running: false }); // sessão anterior fechada no meio
  if (!getExtAutoUpdateState().enabled) return;
  window.setTimeout(() => {
    if (!navigator.onLine) return;
    void runExtensionUpdates({ silent: true }).catch(() => {});
  }, 6000);
}
