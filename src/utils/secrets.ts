// src/utils/secrets.ts
// Acesso a tokens/senhas guardados criptografados pelo processo principal.
// Valores antigos em texto puro no localStorage são migrados automaticamente.

const cache = new Map<string, string>();

const hasVault = () => typeof window !== 'undefined' && !!window.electronAPI?.secretGetSync && !!window.electronAPI?.secretSet;

/**
 * Lê um segredo. `legacyKey` é a chave antiga do localStorage: se existir,
 * o valor é movido para o cofre e apagado do localStorage.
 */
export function getSecret(name: string, legacyKey?: string): string {
  if (cache.has(name)) return cache.get(name)!;
  if (!hasVault()) {
    // Fora do Electron (pré-visualização): usa o localStorage
    try {
      return (legacyKey && localStorage.getItem(legacyKey)) || '';
    } catch {
      return '';
    }
  }
  let value = '';
  try {
    const got: unknown = window.electronAPI!.secretGetSync!(name);
    value = typeof got === 'string' ? got : '';
  } catch {
    value = '';
  }
  if (legacyKey) {
    try {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        if (!value) {
          value = legacy;
          void window.electronAPI!.secretSet!(name, legacy);
        }
        localStorage.removeItem(legacyKey);
      }
    } catch {
      /* ignore */
    }
  }
  cache.set(name, value);
  return value;
}

export function setSecret(name: string, value: string | null, legacyKey?: string): void {
  const v = (value || '').trim();
  cache.set(name, v);
  if (!hasVault()) {
    try {
      if (legacyKey) {
        if (v) localStorage.setItem(legacyKey, v);
        else localStorage.removeItem(legacyKey);
      }
    } catch {
      /* ignore */
    }
    return;
  }
  void window.electronAPI!.secretSet!(name, v || null);
  if (legacyKey) {
    try {
      localStorage.removeItem(legacyKey);
    } catch {
      /* ignore */
    }
  }
}

/** Esquece o valor em memória (ex.: o processo principal acabou de gravar um novo). */
export function invalidateSecret(name: string): void {
  cache.delete(name);
}
