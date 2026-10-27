import pako from 'pako';

export async function readBackupFile(file: File) {
  const raw = new Uint8Array(await file.arrayBuffer());
  let bytes = raw;
  // gzip magic = 0x1F 0x8B
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    bytes = pako.ungzip(raw);
  } else {
    try {
      bytes = pako.ungzip(raw);
    } catch {
      bytes = raw;
    }
  }

  const i = bytes.findIndex((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32);
  return { bytes, isJson: bytes[i] === 0x7b }; // 0x7B = '{'
}
