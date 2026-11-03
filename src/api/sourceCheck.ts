// src/api/sourceCheck.ts
// "Esta fonte funciona?" — faz o caminho inteiro de um site de vídeo, do jeito que o app faz quando
// você vai assistir: abre o site, procura uma obra, lê os episódios e tenta achar o vídeo.
// Serve para o usuário saber, antes (ou depois) de instalar, o que dá para fazer com aquela fonte.

import { searchSite, extractSiteItems } from './siteSearch';
import { videoEpisodes } from './watchSources';
import { t } from '../i18n';

export type CheckStep = 'ok' | 'fail' | 'skip';

export interface SourceCheck {
  /** Quando o teste rodou */
  at: number;
  /** O site respondeu */
  site: CheckStep;
  /** A busca do site funciona pelo app */
  search: CheckStep;
  /** Dá para listar os episódios de uma obra */
  episodes: CheckStep;
  /** O player do app consegue achar o vídeo */
  video: CheckStep;
  /** Quanto tempo levou (ms) */
  ms: number;
  /** Primeiro problema encontrado, em uma linha */
  error?: string;
  /** Obra usada no teste */
  sample?: string;
}

const KEY = 'tp_source_check';

export function readChecks(): Record<string, SourceCheck> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
export function readCheck(host: string): SourceCheck | undefined {
  return readChecks()[hostKey(host)];
}
function saveCheck(host: string, c: SourceCheck) {
  try {
    const all = readChecks();
    all[hostKey(host)] = c;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHECK_EVENT));
}

export const CHECK_EVENT = 'tomodachi:source-check';
export const hostKey = (u: string) =>
  String(u || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
    .toLowerCase();

/** Resumo em uma frase do que dá para fazer com a fonte */
export function checkSummary(c: SourceCheck): { label: string; tone: 'ok' | 'partial' | 'bad'; detail: string } {
  if (c.site !== 'ok') return { label: t('não respondeu'), tone: 'bad', detail: c.error || t('O site não abriu nem pelo navegador do app.') };
  if (c.video === 'ok') return { label: t('funciona'), tone: 'ok', detail: t('Busca, episódios e vídeo: tudo certo por aqui.') };
  if (c.episodes === 'ok') return { label: t('vídeo não abriu'), tone: 'partial', detail: c.error || t('O app lista os episódios, mas não conseguiu pegar o vídeo desta obra. Pode ser só esta obra: teste outra pelo Navegar.') };
  if (c.search === 'ok') return { label: t('sem episódios'), tone: 'partial', detail: c.error || t('A busca funciona, mas o app não achou a lista de episódios.') };
  return { label: t('só navegando'), tone: 'partial', detail: c.error || t('O site abre, mas a busca do app não traz resultados. Use o Navegar para achar a obra e "Assistir no app".') };
}

const PROBE_LIMIT_MS = 75000;

/**
 * Roda o teste. `onStep` avisa a cada etapa (para mostrar o progresso).
 * Não altera nada do usuário: só lê páginas do site.
 */
export async function checkVideoSource(
  baseUrl: string,
  sourceName: string,
  opts: { onStep?: (step: string) => void; signal?: { cancelled: boolean } } = {}
): Promise<SourceCheck> {
  const t0 = Date.now();
  const base = /^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`;
  const out: SourceCheck = { at: Date.now(), site: 'fail', search: 'skip', episodes: 'skip', video: 'skip', ms: 0 };
  const stop = () => opts.signal?.cancelled || Date.now() - t0 > PROBE_LIMIT_MS;
  const finish = () => {
    out.ms = Date.now() - t0;
    saveCheck(base, out);
    return out;
  };

  // 1. O site abre?
  opts.onStep?.(t('abrindo o site…'));
  let home: { html: string; url: string } | null = null;
  try {
    const res = await window.electronAPI?.siteFetchHtml?.({ url: base });
    if (res?.success && res.html) home = { html: res.html, url: res.url || base };
  } catch (err: any) {
    out.error = String(err?.message || err);
  }
  if (!home) {
    out.error = out.error || t('O site não respondeu');
    return finish();
  }
  out.site = 'ok';
  if (stop()) return finish();

  // Uma obra do próprio site (dos lançamentos da página inicial) serve de cobaia
  const doc = new DOMParser().parseFromString(home.html, 'text/html');
  const homeItems = extractSiteItems(doc, home.url, () => 0).filter((i) => !i.isEpisode);
  const probe = homeItems[0];

  // 2. A busca do site funciona pelo app? (procura o nome de uma obra que o site mostra)
  if (probe) {
    opts.onStep?.(t('testando a busca…'));
    try {
      const found = await searchSite(base, probe.title.slice(0, 40), (c) => (c.toLowerCase().includes(probe.title.slice(0, 12).toLowerCase()) ? 1 : 0));
      out.search = found.length ? 'ok' : 'fail';
      if (!found.length) out.error = out.error || t('A busca do site não trouxe resultados pelo app');
    } catch (err: any) {
      out.search = 'fail';
      out.error = out.error || String(err?.message || err);
    }
  }
  if (stop()) return finish();

  // 3. Dá para listar os episódios de uma obra?
  const work = probe;
  if (!work) {
    out.error = out.error || t('O site não mostrou nenhuma obra na página inicial');
    return finish();
  }
  out.sample = work.title;
  opts.onStep?.(t('lendo os episódios…'));
  let episodeUrl = work.url;
  try {
    const eps = await videoEpisodes(work.url, sourceName);
    out.episodes = eps.length ? 'ok' : 'fail';
    if (eps.length) episodeUrl = eps[0].url;
    else out.error = out.error || t('Não achei a lista de episódios desta obra');
  } catch (err: any) {
    out.episodes = 'fail';
    out.error = out.error || String(err?.message || err);
  }
  if (stop()) return finish();

  // 4. O player acha o vídeo? (é o que decide se dá para assistir no app)
  opts.onStep?.(t('procurando o vídeo…'));
  try {
    const res = await window.electronAPI?.extractVideoStream?.(episodeUrl, sourceName, { fresh: true });
    out.video = res?.success && res.type === 'stream' ? 'ok' : 'fail';
    if (out.video === 'fail') out.error = out.error || res?.error || t('O site não entregou o vídeo');
  } catch (err: any) {
    out.video = 'fail';
    out.error = out.error || String(err?.message || err);
  }
  return finish();
}
