// src/api/backup/longShim.ts
// O protobufjs só lê/grava inteiros de 64 bits com precisão quando a biblioteca "long"
// está disponível. No renderer (Vite) ela não é carregada, e IDs de fonte do Mihon
// (ex.: 2499283573021220255) perdiam os últimos dígitos. Este shim mínimo, baseado em
// BigInt, implementa só o que o protobufjs usa.

import protobuf from 'protobufjs';

const U64 = (1n << 64n) - 1n;

class LongShim {
  low: number;
  high: number;
  unsigned: boolean;

  constructor(low: number, high: number, unsigned?: boolean) {
    this.low = low | 0;
    this.high = high | 0;
    this.unsigned = !!unsigned;
  }

  static isLong(v: any): v is LongShim {
    return v instanceof LongShim;
  }

  static fromBits(low: number, high: number, unsigned?: boolean) {
    return new LongShim(low, high, unsigned);
  }

  static fromBigInt(v: bigint, unsigned?: boolean) {
    const u = BigInt.asUintN(64, v);
    return new LongShim(Number(u & 0xffffffffn) | 0, Number((u >> 32n) & 0xffffffffn) | 0, unsigned);
  }

  static fromNumber(n: number, unsigned?: boolean) {
    if (!Number.isFinite(n)) return new LongShim(0, 0, unsigned);
    return LongShim.fromBigInt(BigInt(Math.trunc(n)), unsigned);
  }

  static fromString(s: string, unsigned?: boolean | number) {
    const str = String(s).trim();
    let v = 0n;
    try {
      v = /^-?\d+$/.test(str) ? BigInt(str) : BigInt(Math.trunc(Number(str) || 0));
    } catch {
      v = 0n;
    }
    return LongShim.fromBigInt(v, typeof unsigned === 'boolean' ? unsigned : false);
  }

  static fromValue(v: any, unsigned?: boolean) {
    if (v instanceof LongShim) return v;
    if (typeof v === 'number') return LongShim.fromNumber(v, unsigned);
    if (typeof v === 'bigint') return LongShim.fromBigInt(v, unsigned);
    if (typeof v === 'string') return LongShim.fromString(v, unsigned);
    if (v && typeof v === 'object') return new LongShim(v.low, v.high, unsigned ?? v.unsigned);
    return new LongShim(0, 0, unsigned);
  }

  toBigInt(): bigint {
    const u = (BigInt(this.high >>> 0) << 32n) | BigInt(this.low >>> 0);
    return this.unsigned ? u & U64 : BigInt.asIntN(64, u);
  }

  toNumber(): number {
    return Number(this.toBigInt());
  }

  toString(): string {
    return this.toBigInt().toString();
  }
}

let installed = false;

/** Instala o shim (antes de qualquer protobuf.parse). */
export function installLongShim() {
  if (installed) return;
  installed = true;
  const util = (protobuf as any).util;
  if (util.Long) return; // a biblioteca "long" real já está disponível
  util.Long = LongShim;
  try {
    (protobuf as any).configure();
  } catch {
    /* ignore */
  }
}

installLongShim();
