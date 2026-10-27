// src/utils/subtitles.ts
// Leitura de legendas externas (.srt, .vtt, .ass/.ssa) em uma lista de falas.

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const toSeconds = (h: string, m: string, s: string, ms: string) =>
  Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number((ms || '0').padEnd(3, '0').slice(0, 3)) / 1000;

const stripTags = (t: string) =>
  t
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .trim();

/** SRT e WebVTT (formatos de tempo 00:00:01,000 ou 00:01.000) */
function parseSrtVtt(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  const timeRe = /(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})/;
  for (const block of blocks) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => timeRe.test(l));
    if (idx < 0) continue;
    const m = lines[idx].match(timeRe)!;
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    const body = stripTags(lines.slice(idx + 1).join('\n'));
    if (body && end > start) cues.push({ start, end, text: body });
  }
  return cues;
}

/** Advanced SubStation Alpha (.ass/.ssa) — apenas as linhas "Dialogue" */
function parseAss(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let format: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (/^Format:/i.test(line) && format.length === 0 && /Start/i.test(line) && /Text/i.test(line)) {
      format = line.replace(/^Format:/i, '').split(',').map((f) => f.trim().toLowerCase());
      continue;
    }
    if (!/^Dialogue:/i.test(line)) continue;
    const fields = format.length ? format : ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const parts = line.replace(/^Dialogue:/i, '').split(',');
    const textIdx = fields.indexOf('text');
    const get = (name: string) => (parts[fields.indexOf(name)] || '').trim();
    const t = (v: string) => {
      const mm = v.match(/(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})/);
      return mm ? toSeconds(mm[1], mm[2], mm[3], mm[4].padEnd(2, '0').padEnd(3, '0')) : NaN;
    };
    const start = t(get('start'));
    const end = t(get('end'));
    const body = stripTags(parts.slice(textIdx).join(',').replace(/\\N/gi, '\n').replace(/\\h/g, ' '));
    if (isFinite(start) && isFinite(end) && end > start && body) cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function parseSubtitles(text: string, fileName = ''): SubtitleCue[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ass') || lower.endsWith('.ssa') || /^\s*\[Script Info\]/i.test(text)) return parseAss(text);
  return parseSrtVtt(text);
}

/** Decodifica bytes de legenda: UTF-8 (com ou sem BOM), UTF-16 ou, se houver caracteres inválidos, Windows-1252. */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch {
    return utf8;
  }
}

/** Caminhos de legenda com o mesmo nome do vídeo (ex.: Ep01.mkv → Ep01.srt, Ep01.pt-BR.srt) */
export function siblingSubtitleCandidates(videoPath: string): string[] {
  const base = videoPath.replace(/\.[^.\\/]+$/, '');
  const suffixes = ['', '.pt-BR', '.pt-br', '.pt', '.por', '.en', '.eng'];
  const exts = ['.srt', '.vtt', '.ass', '.ssa'];
  const out: string[] = [];
  for (const sfx of suffixes) for (const ext of exts) out.push(`${base}${sfx}${ext}`);
  return out;
}
