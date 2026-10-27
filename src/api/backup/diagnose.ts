// src/api/backup/diagnose.ts
/** Lista os field numbers de nível superior do protobuf (sem depender de schema) com suporte seguro a varints grandes */
export function scanTopLevelFields(bytes: Uint8Array): number[] {
  const fields: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    // lê a tag varint (fieldNumber << 3 | wireType)
    let tag = 0;
    let shift = 0;
    let b = 0;
    do {
      if (i >= bytes.length) return fields;
      b = bytes[i++];
      tag += (b & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while (b & 0x80);

    const fieldNum = Math.floor(tag / 8);
    const wireType = tag & 0x07;
    if (!fields.includes(fieldNum) && fieldNum > 0) {
      fields.push(fieldNum);
    }

    switch (wireType) {
      case 0: // varint
        do {
          if (i >= bytes.length) return fields;
          b = bytes[i++];
        } while (b & 0x80);
        break;
      case 1: // 64-bit
        i += 8;
        break;
      case 2: { // length-delimited (mensagens, strings, bytes)
        let len = 0;
        let s = 0;
        do {
          if (i >= bytes.length) return fields;
          b = bytes[i++];
          len += (b & 0x7f) * Math.pow(2, s);
          s += 7;
        } while (b & 0x80);
        if (len < 0 || i + len > bytes.length) {
          // Varint corrompido ou fim prematuro
          return fields;
        }
        i += len;
        break;
      }
      case 5: // 32-bit
        i += 4;
        break;
      default:
        // Wire type não padrão (ex: groups legados)
        return fields;
    }
  }
  return fields;
}
