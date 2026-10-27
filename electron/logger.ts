// electron/logger.ts
// Registro de erros em arquivo: <userData>/logs/tomodachi.log (rotação simples por tamanho).

import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const MAX_BYTES = 2 * 1024 * 1024;
let logPath = '';

const logsDir = () => path.join(app.getPath('userData'), 'logs');

function ensure() {
  if (logPath) return logPath;
  try {
    fs.mkdirSync(logsDir(), { recursive: true });
  } catch {
    /* ignore */
  }
  logPath = path.join(logsDir(), 'tomodachi.log');
  return logPath;
}

function fmt(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack || ''}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function writeLog(level: 'info' | 'warn' | 'error', scope: string, ...parts: unknown[]) {
  try {
    const file = ensure();
    try {
      if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, `${file}.1`);
    } catch {
      /* arquivo ainda não existe */
    }
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} (${scope}) ${parts.map(fmt).join(' ')}\n`;
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    /* nunca deixa o log derrubar o app */
  }
}

/** Captura console.error/warn do processo principal e erros do renderer. */
export function setupLogging() {
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    writeLog('error', 'main', ...args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    writeLog('warn', 'main', ...args);
    origWarn(...args);
  };

  ipcMain.on('log:write', (_e, payload: { level?: 'info' | 'warn' | 'error'; message?: string; stack?: string }) => {
    writeLog(payload?.level || 'error', 'renderer', payload?.message || '', payload?.stack || '');
  });

  ipcMain.handle('log:openFolder', async () => {
    ensure();
    const err = await shell.openPath(logsDir());
    return { success: !err, error: err || undefined };
  });

  writeLog('info', 'main', `Tomodachi Player ${app.getVersion()} iniciado`);
}
