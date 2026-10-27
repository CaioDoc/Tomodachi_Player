export function toMediaUrl(filePath: string): string {
  if (!filePath) return '';
  if (
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('media-file://') ||
    filePath.startsWith('media://') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('blob:')
  ) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const encoded = normalized
    .split('/')
    .map((seg, idx) => {
      if (idx === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
      return encodeURIComponent(seg);
    })
    .join('/');
  return `media-file:///${encoded}`;
}

export const COVER_NAMES = ['cover', 'capa', 'poster', 'folder', 'thumb', '0001', '001', '01', '1'];

export function pickCover(images: string[]): string | null {
  if (!images || !images.length) return null;
  const sorted = [...images].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
  const byName = sorted.find((f) => {
    const base = f.split(/[\\/]/).pop()!.toLowerCase().replace(/\.[a-z0-9]+$/, '');
    return COVER_NAMES.includes(base);
  });
  return byName ?? sorted[0];
}
