// electron/suwayomi.ts
// Ponte com o Suwayomi-Server (roda as extensões reais do Mihon/Tachiyomi).
// As consultas GraphQL passam pelo processo principal para evitar problemas de CORS.

import { app, ipcMain } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

interface SuwayomiAuth {
  baseUrl: string;
  username?: string;
  password?: string;
}

let auth: SuwayomiAuth | null = null;
let serverProcess: ChildProcess | null = null;

const normalizeBase = (url: string) => (url || '').trim().replace(/\/+$/, '');

const authHeader = (a: SuwayomiAuth | null): string | null => {
  if (!a?.username) return null;
  return 'Basic ' + Buffer.from(`${a.username}:${a.password || ''}`).toString('base64');
};

/** Usado pelo onBeforeSendHeaders para autenticar imagens (capas e páginas) do servidor. */
export function suwayomiAuthFor(url: string): string | null {
  if (!auth?.baseUrl || !auth.username) return null;
  return url.startsWith(auth.baseUrl + '/') ? authHeader(auth) : null;
}

export function registerSuwayomiIpcHandlers() {
  ipcMain.handle('suwayomi:setAuth', (_e, a: SuwayomiAuth) => {
    auth = a?.baseUrl ? { ...a, baseUrl: normalizeBase(a.baseUrl) } : null;
    return { success: true };
  });

  ipcMain.handle(
    'suwayomi:graphql',
    async (_e, args: { baseUrl: string; query: string; variables?: Record<string, unknown>; username?: string; password?: string; timeoutMs?: number }) => {
      const base = normalizeBase(args?.baseUrl);
      if (!/^https?:\/\//i.test(base)) return { success: false, error: 'Endereço do servidor inválido' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(3000, Math.min(args.timeoutMs || 60000, 180000)));
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
        const basic = authHeader({ baseUrl: base, username: args.username, password: args.password });
        if (basic) headers.Authorization = basic;
        const res = await fetch(`${base}/api/graphql`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query: args.query, variables: args.variables || {} }),
          signal: controller.signal,
        });
        if (res.status === 401) return { success: false, error: 'Usuário ou senha do Suwayomi incorretos', status: 401 };
        const text = await res.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          return { success: false, error: `Resposta inesperada do servidor (HTTP ${res.status})`, status: res.status };
        }
        if (Array.isArray(json?.errors) && json.errors.length > 0) {
          return { success: false, error: json.errors.map((er: any) => er?.message).filter(Boolean).join(' · ') || 'Erro do servidor', data: json.data };
        }
        return { success: true, data: json?.data };
      } catch (err: any) {
        const msg = err?.name === 'AbortError' ? 'O servidor demorou demais para responder' : err?.cause?.code === 'ECONNREFUSED' ? 'Servidor Suwayomi não está rodando nesse endereço' : err?.message || String(err);
        return { success: false, error: msg };
      } finally {
        clearTimeout(timer);
      }
    }
  );

  // Inicia o servidor a partir do executável/atalho escolhido pelo usuário
  ipcMain.handle('suwayomi:start', async (_e, exePath: string) => {
    try {
      if (serverProcess && serverProcess.exitCode === null) return { success: true, alreadyRunning: true };
      if (!exePath || !fs.existsSync(exePath)) return { success: false, error: 'Arquivo do Suwayomi não encontrado' };
      const ext = path.extname(exePath).toLowerCase();
      const cwd = path.dirname(exePath);
      let child: ChildProcess;
      if (ext === '.jar') {
        child = spawn('java', ['-jar', exePath], { cwd, detached: false, windowsHide: true, stdio: 'ignore' });
      } else if (ext === '.bat' || ext === '.cmd') {
        child = spawn('cmd.exe', ['/c', exePath], { cwd, detached: false, windowsHide: true, stdio: 'ignore' });
      } else {
        child = spawn(exePath, [], { cwd, detached: false, windowsHide: true, stdio: 'ignore' });
      }
      child.on('error', (err) => console.warn('[Suwayomi] Falha ao iniciar:', err));
      serverProcess = child;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('suwayomi:isManaged', () => ({ running: !!serverProcess && serverProcess.exitCode === null }));

  // Encerra o servidor iniciado pelo app ao fechar
  app.on('before-quit', () => {
    try {
      if (serverProcess && serverProcess.exitCode === null && serverProcess.pid) {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(serverProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else serverProcess.kill();
      }
    } catch {
      /* ignore */
    }
  });
}
