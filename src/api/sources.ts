// src/api/sources.ts
// "Fontes" de Animes & Vídeos num lugar só: extensões (estilo Aniyomi), plugins do Nuvio
// e addons do Stremio. O usuário cola qualquer link e o app descobre o que é.

import { loadRepos, saveRepos, writeCache, readCache } from './reposStore';
import { loadRepoIndex, type RepoExtension } from './repositories';
import { getInstalledExtensions, installExtension, resolveSourceBaseUrl, type InstalledExtension } from './extensionRegistry';
import { fetchJson, getNuvioState, installFromLink, isScraperEnabled, refreshNuvioRepos, refreshStremioAddons, setNuvioEnabled, type InstallResult } from './nuvio';
import { t } from '../i18n';

export type AddedSource = InstallResult | { kind: 'ext-repo'; url: string; label: string; count: number };

const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();

/** O link parece um repositório de extensões (Aniyomi/Mihon)? */
function looksLikeExtRepo(url: string): boolean {
  return /\.pb($|\?)/i.test(url) || /index(\.min)?\.json($|\?)/i.test(url) || /\/repo\/?$/i.test(url);
}

/** Adiciona um repositório de extensões de anime e carrega a lista dele */
export async function addAnimeExtRepo(input: string): Promise<{ url: string; label: string; count: number }> {
  const url = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const list = await loadRepoIndex(url);
  if (!list.length) throw new Error(t('O repositório está vazio.'));
  writeCache('anime', url, list);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const owner = /githubusercontent\.com\/([^/]+)/i.exec(url)?.[1] || /github\.com\/([^/]+)/i.exec(url)?.[1];
  const label = owner ? `${owner}` : host;
  const repos = loadRepos('anime');
  if (!repos.some((r) => norm(r.url) === norm(url))) saveRepos('anime', [...repos, { url, label }]);
  try {
    window.dispatchEvent(new CustomEvent('extensions:updated'));
  } catch {
    /* ignore */
  }
  return { url, label, count: list.length };
}

/**
 * Adiciona qualquer fonte pelo link:
 *  - repositório de extensões (index.min.json / .pb) → Extensões
 *  - manifest.json do Nuvio → Plugins
 *  - manifest.json / stremio:// de addon → Addons
 */
export async function addAnySource(input: string): Promise<AddedSource> {
  const raw = String(input || '').trim();
  if (!raw) throw new Error(t('Cole um link'));
  if (/^stremio:\/\//i.test(raw) || /manifest\.json($|\?)/i.test(raw)) {
    setNuvioEnabled(true);
    return installFromLink(raw);
  }
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  if (looksLikeExtRepo(url)) {
    const r = await addAnimeExtRepo(url);
    return { kind: 'ext-repo', ...r };
  }
  // Link sem pista: olha o conteúdo
  let data: any = null;
  try {
    data = await fetchJson(url);
  } catch {
    /* pode ser um link do GitHub ou sem /manifest.json */
  }
  if (Array.isArray(data) || Array.isArray(data?.apps)) {
    const r = await addAnimeExtRepo(url);
    return { kind: 'ext-repo', ...r };
  }
  setNuvioEnabled(true);
  return installFromLink(raw);
}

/** Extensões disponíveis nos repositórios de anime (do cache; carrega se preciso) */
export async function availableAnimeExtensions(force = false): Promise<{ repoUrl: string; repoLabel: string; ext: RepoExtension; error?: undefined }[]> {
  const out: { repoUrl: string; repoLabel: string; ext: RepoExtension }[] = [];
  await Promise.all(
    loadRepos('anime').map(async (r) => {
      let list = force ? null : (readCache('anime', r.url) as RepoExtension[] | null);
      if (!list) {
        try {
          list = await loadRepoIndex(r.url);
          writeCache('anime', r.url, list);
        } catch {
          list = [];
        }
      }
      for (const ext of list) {
        const id = (ext.pkg || ext.name).toLowerCase();
        if (out.some((o) => (o.ext.pkg || o.ext.name).toLowerCase() === id)) continue;
        out.push({ repoUrl: r.url, repoLabel: r.label, ext });
      }
    })
  );
  return out;
}

export function installAnimeExtension(ext: RepoExtension, repoUrl: string): InstalledExtension {
  const sourceName = ext.sources?.[0]?.name || ext.name;
  const inst: InstalledExtension = {
    pkg: ext.pkg || ext.name,
    name: ext.name.replace(/^Aniyomi:\s*/i, ''),
    sourceName,
    lang: ext.lang || 'all',
    baseUrl: ext.baseUrl || ext.sources?.[0]?.baseUrl || resolveSourceBaseUrl(sourceName) || '',
    repoUrl,
    installedAt: Date.now(),
    type: 'anime',
    version: ext.versionName || ext.version,
  };
  installExtension(inst);
  return inst;
}

export function removeAnimeExtRepo(url: string) {
  saveRepos(
    'anime',
    loadRepos('anime').filter((r) => r.url !== url)
  );
  try {
    window.dispatchEvent(new CustomEvent('extensions:updated'));
  } catch {
    /* ignore */
  }
}

/** Quantas fontes de vídeo estão prontas para uso */
export function videoSourceCounts() {
  const st = getNuvioState();
  const plugins = st.enabled ? st.repos.reduce((n, r) => n + r.scrapers.filter((s) => isScraperEnabled(st, r, s)).length, 0) : 0;
  const addons = st.enabled ? st.addons.filter((a) => a.enabled && a.resources.some((x) => x.name === 'stream')).length : 0;
  const extensions = getInstalledExtensions('anime').length;
  // total = itens instalados (como aparecem em "Suas fontes")
  return { extensions, plugins, addons, total: extensions + st.repos.length + st.addons.length };
}

/** Atualiza tudo: índices dos repositórios, plugins e addons */
export async function refreshAllVideoSources(): Promise<{ failed: number }> {
  const [a, b, c] = await Promise.all([
    refreshNuvioRepos().catch(() => ({ failed: 1 })),
    refreshStremioAddons().catch(() => ({ failed: 1 })),
    availableAnimeExtensions(true).then(() => ({ failed: 0 })),
  ]);
  return { failed: (a.failed || 0) + (b.failed || 0) + (c.failed || 0) };
}

export const SOURCES_CHANGED_EVENTS = ['extensions:updated', 'tomodachi:nuvio-changed', 'storage'];
