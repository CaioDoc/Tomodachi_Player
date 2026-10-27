import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme } from './theme/themeEngine';
import { ErrorBoundary } from './components/ErrorBoundary';
import { syncSuwayomiAuth, getSuwayomiConfig, ensureServerRunning } from './api/suwayomi';
import { initAniListSync } from './api/anilistSync';
import { initExtensionAutoUpdate } from './api/extensionAutoUpdate';

// Inicializa o tema ativo antes do primeiro render
initTheme();

// AniList: envia o progresso ao marcar capítulos/episódios como lidos
initAniListSync();

// Extensões de mangá e anime: atualização automática ao abrir o app (desligável em Configurações)
initExtensionAutoUpdate();

// Suwayomi: envia credenciais ao processo principal e, se configurado, inicia o servidor junto com o app
try {
  syncSuwayomiAuth();
  if (getSuwayomiConfig()?.autoStart) void ensureServerRunning().catch(() => {});
} catch {
  /* ignore */
}

// Erros não tratados vão para o arquivo de log (Configurações → Sistema → Abrir pasta de logs)
window.addEventListener('error', (e) => {
  window.electronAPI?.logError?.({ level: 'error', message: e.message || String(e.error), stack: e.error?.stack });
});
window.addEventListener('unhandledrejection', (e) => {
  const r: any = e.reason;
  window.electronAPI?.logError?.({ level: 'error', message: `Promise rejeitada: ${r?.message || String(r)}`, stack: r?.stack });
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary label="Tomodachi Player">
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
