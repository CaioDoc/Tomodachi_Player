// electron/anilistAuth.ts
// Login no AniList (OAuth "implicit grant"): abre a página de autorização e captura
// o token quando o AniList redireciona para https://anilist.co/api/v2/oauth/pin#access_token=...

import { BrowserWindow, ipcMain } from 'electron';
import { setSecret } from './secrets';

export const ANILIST_CLIENT_ID = '53247';
const AUTH_URL = `https://anilist.co/api/v2/oauth/authorize?client_id=${ANILIST_CLIENT_ID}&response_type=token`;

export function registerAniListAuthIpc(getParent: () => BrowserWindow | null) {
  let open: BrowserWindow | null = null;

  ipcMain.handle('anilist:login', async () => {
    if (open && !open.isDestroyed()) {
      open.focus();
      return { success: false, error: 'A janela de login já está aberta' };
    }
    return new Promise<{ success: boolean; token?: string; expiresAt?: number; error?: string }>((resolve) => {
      const win = new BrowserWindow({
        title: 'Entrar no AniList',
        width: 520,
        height: 760,
        parent: getParent() || undefined,
        modal: false,
        autoHideMenuBar: true,
        backgroundColor: '#0b1622',
        webPreferences: { nodeIntegration: false, contextIsolation: true, partition: 'persist:anilist' },
      });
      open = win;
      let done = false;

      const finish = (r: { success: boolean; token?: string; expiresAt?: number; error?: string }) => {
        if (done) return;
        done = true;
        open = null;
        if (r.success && r.token) setSecret('anilist_token', r.token);
        try {
          if (!win.isDestroyed()) win.close();
        } catch {
          /* ignore */
        }
        resolve(r);
      };

      const check = (url: string) => {
        if (!url) return;
        const hashIdx = url.indexOf('#');
        if (hashIdx < 0 || !/anilist\.co\/api\/v2\/oauth\/pin/i.test(url)) return;
        const params = new URLSearchParams(url.slice(hashIdx + 1));
        const token = params.get('access_token');
        if (token) {
          const expiresIn = Number(params.get('expires_in')) || 0;
          finish({ success: true, token, expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined });
        } else if (params.get('error')) {
          finish({ success: false, error: params.get('error_description') || params.get('error') || 'Login recusado' });
        }
      };

      win.webContents.on('will-redirect', (_e, url) => check(url));
      win.webContents.on('did-redirect-navigation', (_e, url) => check(url));
      win.webContents.on('did-navigate', (_e, url) => check(url));
      win.webContents.on('did-navigate-in-page', (_e, url) => check(url));
      win.webContents.on('did-finish-load', () => check(win.webContents.getURL()));
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.on('closed', () => finish({ success: false, error: 'Janela de login fechada' }));
      win.loadURL(AUTH_URL).catch((err: any) => {
        // Redirecionamentos interrompem o carregamento inicial (ERR_ABORTED) — isso é normal
        if (String(err?.code || err?.message || '').includes('ERR_ABORTED')) return;
        if (!win.isDestroyed() && !/anilist\.co/i.test(win.webContents.getURL())) {
          finish({ success: false, error: 'Não foi possível abrir o AniList (sem internet?)' });
        }
      });
    });
  });

  ipcMain.handle('anilist:logout', async () => {
    setSecret('anilist_token', null);
    return { success: true };
  });
}
