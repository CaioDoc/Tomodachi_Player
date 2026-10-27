// electron/secrets.ts
// Guarda tokens e senhas criptografados com o cofre do sistema (DPAPI no Windows)
// em vez de texto puro no localStorage.

import { app, ipcMain, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

type Store = Record<string, { enc?: string; plain?: string }>;

const file = () => path.join(app.getPath('userData'), 'secrets.json');
let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), 'utf8'));
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persist(store: Store) {
  try {
    const tmp = `${file()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store), 'utf8');
    fs.renameSync(tmp, file());
  } catch (err) {
    console.warn('[secrets] Falha ao salvar:', err);
  }
}

const canEncrypt = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};

export function getSecret(name: string): string {
  const entry = load()[name];
  if (!entry) return '';
  if (entry.enc) {
    try {
      return safeStorage.decryptString(Buffer.from(entry.enc, 'base64'));
    } catch {
      return '';
    }
  }
  return entry.plain || '';
}

export function setSecret(name: string, value: string | null) {
  const store = load();
  if (!value) {
    delete store[name];
  } else if (canEncrypt()) {
    store[name] = { enc: safeStorage.encryptString(value).toString('base64') };
  } else {
    store[name] = { plain: value };
  }
  persist(store);
}

const VALID_NAME = /^[a-z0-9_.-]{1,64}$/i;

export function registerSecretsIpc() {
  // Síncrono: o app lê esses valores em funções síncronas (ex.: montar cabeçalhos)
  ipcMain.on('secrets:getSync', (event, name: string) => {
    event.returnValue = typeof name === 'string' && VALID_NAME.test(name) ? getSecret(name) : '';
  });
  ipcMain.handle('secrets:set', (_e, name: string, value: string | null) => {
    if (typeof name !== 'string' || !VALID_NAME.test(name)) return { success: false };
    setSecret(name, typeof value === 'string' ? value : null);
    return { success: true, encrypted: canEncrypt() };
  });
}
