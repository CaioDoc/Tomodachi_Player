// electron/streamHeaders.ts
// Cabeçalhos exigidos por streams de plugins (Referer, User-Agent, Origin…).
// O player do Chromium, o FFmpeg e as miniaturas usam os mesmos cabeçalhos.

const BLOCKED = new Set(['host', 'content-length', 'range', 'connection', 'accept-encoding']);
const TTL = 12 * 60 * 60 * 1000;
const byHost = new Map<string, { headers: Record<string, string>; expires: number }>();

const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
};

export function registerStreamHeaders(url: string, headers: Record<string, string> | undefined) {
  const host = hostOf(url);
  if (!host || !headers) return;
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!k || v == null || BLOCKED.has(k.toLowerCase())) continue;
    if (/[\r\n]/.test(String(v)) || /[^\w-]/.test(k)) continue;
    clean[k] = String(v);
  }
  if (Object.keys(clean).length === 0) return;
  byHost.set(host, { headers: clean, expires: Date.now() + TTL });
  if (byHost.size > 200) byHost.delete(byHost.keys().next().value as string);
}

export function streamHeadersFor(url: string): Record<string, string> | null {
  const host = hostOf(url);
  if (!host) return null;
  const hit = byHost.get(host);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    byHost.delete(host);
    return null;
  }
  return hit.headers;
}

/** Cabeçalhos no formato do FFmpeg (-headers "K: V\r\n…") */
export function ffmpegHeaderString(url: string, fallback: { userAgent: string; referer?: string }): string {
  const extra = streamHeadersFor(url) || {};
  const lower = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v]));
  const lines: string[] = [];
  lines.push(`User-Agent: ${lower['user-agent'] || fallback.userAgent}`);
  const referer = lower['referer'] || fallback.referer;
  if (referer) lines.push(`Referer: ${referer}`);
  for (const [k, v] of Object.entries(extra)) {
    const lk = k.toLowerCase();
    if (lk === 'user-agent' || lk === 'referer') continue;
    lines.push(`${k}: ${v}`);
  }
  return lines.join('\r\n') + '\r\n';
}
