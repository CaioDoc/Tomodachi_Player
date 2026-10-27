// electron/nuvio/hostPreload.ts
// Preload da janela (oculta e com sandbox) onde rodam os plugins do Nuvio.
// Expõe só duas pontes: rede (assíncrona) e criptografia (síncrona, feita pelo Node).

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__nuvioHost', {
  fetch: (req: unknown) => ipcRenderer.invoke('nuvio:host-fetch', req),
  crypto: (op: unknown) => ipcRenderer.sendSync('nuvio:host-crypto', op),
});
