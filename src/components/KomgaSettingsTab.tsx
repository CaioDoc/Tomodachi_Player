// src/components/KomgaSettingsTab.tsx
import React, { useState, useEffect } from 'react';
import {
  Server,
  Key,
  User,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  BookOpen,
  ExternalLink,
  ShieldCheck,
  Check,
  FolderCheck,
  Sparkles,
  Info
} from 'lucide-react';
import {
  getKomgaConfig,
  saveKomgaConfig,
  testKomgaConnection,
  fetchKomgaLibraries,
  syncKomgaToLibrary,
  type KomgaConfig,
  type SyncProgress,
  type KomgaTestResult,
} from '../api/komga';
import { t, tn, tMaybe, locale } from '../i18n';

interface KomgaSettingsTabProps {
  onOpenLibrary?: () => void;
}

export const KomgaSettingsTab: React.FC<KomgaSettingsTabProps> = ({ onOpenLibrary }) => {
  const [config, setConfig] = useState<KomgaConfig>(getKomgaConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Estados de teste de conexão
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<KomgaTestResult | null>(null);

  // Estados de bibliotecas disponíveis
  const [availableLibraries, setAvailableLibraries] = useState<Array<{ id: string; name: string; root: string }>>([]);
  const [loadingLibs, setLoadingLibs] = useState(false);

  // Estados de sincronização
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    seriesCount: number;
    booksCount: number;
    error?: string;
  } | null>(null);

  // Salva automaticamente ao alterar campos
  const updateConfig = (patch: Partial<KomgaConfig>) => {
    const updated = saveKomgaConfig(patch);
    setConfig(updated);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testKomgaConnection(config);
      setTestResult(res);
      if (res.success && res.libraries) {
        setAvailableLibraries(res.libraries);
      }
    } catch (e: any) {
      setTestResult({ success: false, error: tMaybe(e?.message) || t('Falha ao testar conexão') });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleLibrary = (libId: string) => {
    const current = new Set(config.selectedLibraries || []);
    if (current.has(libId)) {
      current.delete(libId);
    } else {
      current.add(libId);
    }
    updateConfig({ selectedLibraries: Array.from(current) });
  };

  const handleSelectAllLibraries = () => {
    if (config.selectedLibraries.length === availableLibraries.length) {
      updateConfig({ selectedLibraries: [] });
    } else {
      updateConfig({ selectedLibraries: availableLibraries.map((l) => l.id) });
    }
  };

  const handleStartSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress({ message: t('Iniciando sincronização...'), current: 0, total: 100 });

    try {
      const res = await syncKomgaToLibrary((p) => {
        setSyncProgress(p);
      });
      setSyncResult(res);
      // Atualiza configuração com dados novos
      setConfig(getKomgaConfig());
    } catch (e: any) {
      setSyncResult({
        success: false,
        seriesCount: 0,
        booksCount: 0,
        error: tMaybe(e?.message) || t('Erro durante a sincronização.'),
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Apresentação Komga */}
      <div className="bg-surface border border-line rounded-lg p-5 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-subtle border border-line flex items-center justify-center text-accent shrink-0">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
                {t('Servidor Komga (Mídia & Quadrinhos)')}
              </h2>
              <p className="text-xs text-fg-muted mt-0.5 leading-relaxed">
                {t('Sincronize séries, mangás, quadrinhos e livros armazenados no seu servidor Komga diretamente para a')}{' '}
                <strong>{t('Minha Biblioteca')}</strong>{' '}
                {t('com leitura nativa integrada.')}
              </p>
            </div>
          </div>

          <a
            href="https://komga.org/docs/introduction/"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (window.electronAPI?.openExternal) {
                e.preventDefault();
                window.electronAPI.openExternal(e.currentTarget.href);
              }
            }}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover shrink-0 hover:underline"
            title={t('Abrir documentação do Komga')}
          >
            <span>{t('Documentação Oficial')}</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* Configuração de Conexão */}
      <div className="bg-surface border border-line rounded-lg p-5 flex flex-col gap-4 shadow-xs">
        <h3 className="text-xs font-semibold text-fg uppercase tracking-wider font-mono">
          {t('1. Conexão do Servidor')}
        </h3>

        {/* URL do Servidor */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-fg-2 flex items-center gap-2">
            <span>{t('URL do Servidor Komga')}</span>
            <span className="text-[10px] text-fg-muted font-mono">{t('(Ex: http://localhost:25600 ou https://komga.meudominio.com)')}</span>
          </label>
          <input
            type="text"
            value={config.serverUrl}
            onChange={(e) => updateConfig({ serverUrl: e.target.value })}
            placeholder="http://localhost:25600"
            className="w-full bg-canvas border border-line rounded-md px-3 py-2 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Tipo de Autenticação */}
        <div className="flex flex-col gap-2 pt-2 border-t border-line/60">
          <label className="text-xs font-medium text-fg-2">
            {t('Método de Autenticação')}
          </label>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer hover:text-white">
              <input
                type="radio"
                name="authType"
                checked={config.authType === 'apiKey'}
                onChange={() => updateConfig({ authType: 'apiKey' })}
                className="accent-accent"
              />
              <span>{t('Chave de API (Recomendado)')}</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer hover:text-white">
              <input
                type="radio"
                name="authType"
                checked={config.authType === 'credentials'}
                onChange={() => updateConfig({ authType: 'credentials' })}
                className="accent-accent"
              />
              <span>{t('Usuário e Senha (Basic Auth)')}</span>
            </label>
          </div>
        </div>

        {/* Campo de Chave de API */}
        {config.authType === 'apiKey' ? (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-fg-2 flex items-center justify-between">
              <span>{t('Chave de API do Komga')}</span>
              <span className="text-[10px] text-fg-muted">{t('Gerada em: Minha Conta > Chaves de API no Komga')}</span>
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => updateConfig({ apiKey: e.target.value })}
                placeholder={t('Insira sua chave de API do Komga...')}
                className="w-full bg-canvas border border-line rounded-md pl-3 pr-10 py-2 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-2">{t('Usuário / Email')}</label>
              <div className="relative">
                <input
                  type="text"
                  value={config.username}
                  onChange={(e) => updateConfig({ username: e.target.value })}
                  placeholder={t('usuario@komga.org')}
                  className="w-full bg-canvas border border-line rounded-md pl-3 pr-3 py-2 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-fg-2">{t('Senha')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={config.password}
                  onChange={(e) => updateConfig({ password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-canvas border border-line rounded-md pl-3 pr-10 py-2 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão Testar Conexão */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !config.serverUrl.trim()}
            className="px-4 py-2 rounded-md bg-subtle hover:bg-elevated text-fg border border-line text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            {testing ? (
              <>
                <RefreshCw size={13} className="animate-spin text-accent" />
                <span>{t('Testando conexão...')}</span>
              </>
            ) : (
              <>
                <ShieldCheck size={14} className="text-success-fg" />
                <span>{t('Testar Conexão')}</span>
              </>
            )}
          </button>

          {testResult?.success && (
            <div className="flex items-center gap-2 text-xs text-success-fg font-medium bg-success/[0.1] border border-success/[0.27] px-3 py-1.5 rounded-md">
              <CheckCircle2 size={14} />
              <span>
                {t('Conectado com sucesso! Usuário:')} <strong>{testResult.user?.email || t('Autenticado')}</strong>
                {testResult.libraries && ` • ${tn(testResult.libraries.length, '{n} biblioteca encontrada', '{n} bibliotecas encontradas')}`}
              </span>
            </div>
          )}

          {testResult && !testResult.success && (
            <div className="flex items-center gap-2 text-xs text-danger-fg font-medium bg-danger/[0.1] border border-danger/[0.27] px-3 py-1.5 rounded-md flex-1">
              <AlertCircle size={14} className="shrink-0" />
              <span className="truncate">{tMaybe(testResult.error)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Seleção de Bibliotecas do Komga (se houver) */}
      {availableLibraries.length > 0 && (
        <div className="bg-surface border border-line rounded-lg p-5 flex flex-col gap-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wider font-mono flex items-center gap-2">
              <Layers size={14} className="text-accent" />
              <span>{t('2. Bibliotecas para Sincronizar ({n})', { n: availableLibraries.length })}</span>
            </h3>
            <button
              type="button"
              onClick={handleSelectAllLibraries}
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              {config.selectedLibraries.length === availableLibraries.length
                ? t('Desmarcar Todas')
                : t('Sincronizar Todas')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
            {availableLibraries.map((lib) => {
              const isSelected =
                config.selectedLibraries.length === 0 || config.selectedLibraries.includes(lib.id);

              return (
                <div
                  key={lib.id}
                  onClick={() => handleToggleLibrary(lib.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-subtle border-accent/60 text-fg'
                      : 'bg-canvas border-line text-fg-muted hover:border-line/80'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 ${
                      isSelected ? 'bg-accent border-accent text-accent-fg' : 'border-line'
                    }`}
                  >
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold truncate leading-tight">{lib.name}</h4>
                    <p className="text-[10px] text-fg-muted truncate mt-0.5" title={lib.root}>
                      {lib.root}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ação de Sincronização */}
      <div className="bg-surface border border-line rounded-lg p-5 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wider font-mono">
              {t('3. Sincronização com Minha Biblioteca')}
            </h3>
            <p className="text-xs text-fg-muted mt-0.5">
              {t('Baixa os metadados das obras, capas e estrutura de volumes/capítulos do Komga e funde com suas obras favoritas.')}
            </p>
          </div>

          <button
            type="button"
            disabled={syncing || !config.serverUrl.trim()}
            onClick={handleStartSync}
            className="px-5 py-2.5 rounded-lg bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? t('Sincronizando...') : t('Sincronizar Minha Biblioteca')}</span>
          </button>
        </div>

        {/* Barra de Progresso durante a sincronização */}
        {syncing && syncProgress && (
          <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-canvas border border-line">
            <div className="flex items-center justify-between text-xs">
              <span className="text-fg font-medium truncate mr-2">{tMaybe(syncProgress.message)}</span>
              <span className="text-fg-muted font-mono shrink-0">{syncProgress.current}%</span>
            </div>
            <div className="w-full h-2 bg-subtle rounded-full overflow-hidden">
              <div
                className="h-full bg-linear-to-r from-success to-accent transition-all duration-300 rounded-full"
                style={{ width: `${syncProgress.current}%` }}
              />
            </div>
          </div>
        )}

        {/* Notificação de Sucesso */}
        {syncResult?.success && (
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-success/[0.1] border border-success/[0.27] text-xs">
            <div className="flex items-center gap-2.5 text-success-fg">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>
                <strong>{t('Sincronização concluída!')}</strong>{' '}
                {t('{series} série(s) e {books} livro(s) adicionados à Minha Biblioteca.', { series: syncResult.seriesCount, books: syncResult.booksCount })}
              </span>
            </div>
            {onOpenLibrary && (
              <button
                type="button"
                onClick={onOpenLibrary}
                className="px-3 py-1 bg-success hover:bg-success-hover text-white rounded text-xs font-medium transition-colors cursor-pointer shrink-0 ml-3"
              >
                {t('Abrir Minha Biblioteca')}
              </button>
            )}
          </div>
        )}

        {/* Notificação de Erro */}
        {syncResult && !syncResult.success && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-danger/[0.1] border border-danger/[0.27] text-xs text-danger-fg">
            <AlertCircle size={16} className="shrink-0" />
            <span>{t('Falha na sincronização: {error}', { error: tMaybe(syncResult.error) })}</span>
          </div>
        )}

        {/* Estatísticas e Informações da Última Sincronização */}
        {config.syncStats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-line/60">
            <div className="p-3 rounded-lg bg-canvas border border-line flex flex-col gap-0.5">
              <span className="text-[10px] text-fg-muted uppercase font-mono">{t('Séries Sincronizadas')}</span>
              <span className="text-base font-semibold text-fg tabular-nums">
                {config.syncStats.seriesCount}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-canvas border border-line flex flex-col gap-0.5">
              <span className="text-[10px] text-fg-muted uppercase font-mono">{t('Livros / Capítulos')}</span>
              <span className="text-base font-semibold text-fg tabular-nums">
                {config.syncStats.booksCount}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-canvas border border-line flex flex-col gap-0.5">
              <span className="text-[10px] text-fg-muted uppercase font-mono">{t('Última Sincronização')}</span>
              <span className="text-xs font-semibold text-fg truncate">
                {new Date(config.syncStats.lastSyncedAt).toLocaleString(locale)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
