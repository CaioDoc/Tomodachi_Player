// src/components/SettingsRepos.tsx
import React, { useState, useEffect } from 'react';
import { toast, confirmDialog } from './Feedback';
import { APP_VERSION } from '../constants/labels';
import { 
  Plus, 
  Trash2, 
  Database, 
  Loader2, 
  Check, 
  AlertCircle, 
  Key, 
  RotateCcw, 
  Sparkles, 
  Search,
  Globe,
  Layers,
  BookOpen,
  Film,
  AlertTriangle,
  Palette,
  ShieldCheck,
  Cpu,
  Server
} from 'lucide-react';
import { DEFAULT_REPOS, type DefaultRepo } from '../api/defaultRepos';
import { fetchRepository } from '../api/repositories';
import { DEFAULT_API_KEY, getNHentaiToken, setNHentaiToken } from '../api/nhentai';
import { AniListAccountCard } from './AniListPanel';
import { ThemeEditorTab } from './ThemeEditorTab';
import { SuwayomiSetupPanel } from './SuwayomiSetup';
import { LanguageDropdown } from './LanguagePicker';
import { SupportBanner } from './SupportBanner';
import { ExtensionAutoUpdateCard } from './ExtensionAutoUpdateCard';
import { KomgaSettingsTab } from './KomgaSettingsTab';
import type { ExtensionRepo } from '../types';
import { t, tn, tMaybe } from '../i18n';

const STORAGE_KEY = 'repos';

const ALL_DEFAULT_REPOS = [
  ...DEFAULT_REPOS.manga.map((r) => ({ ...r, type: 'manga' as const })),
  ...DEFAULT_REPOS.anime.map((r) => ({ ...r, type: 'anime' as const })),
];

function loadRepos(): string[] {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* ignora JSON corrompido e recria */
    }
  }
  const seeded = ALL_DEFAULT_REPOS.map((r) => r.url);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

type SettingsSection = 'appearance' | 'repos' | 'suwayomi' | 'accounts' | 'komga' | 'system';

export const SettingsRepos: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    // Outras telas podem pedir uma seção específica (ex.: "Configurar Suwayomi")
    try {
      const req = sessionStorage.getItem('tp_settings_section') as SettingsSection | null;
      sessionStorage.removeItem('tp_settings_section');
      if (req && ['appearance', 'repos', 'suwayomi', 'accounts', 'komga', 'system'].includes(req)) return req;
    } catch {
      /* ignore */
    }
    return 'appearance';
  });
  useEffect(() => {
    const on = (e: Event) => {
      const s = (e as CustomEvent).detail as SettingsSection;
      if (s) setActiveSection(s);
      try {
        sessionStorage.removeItem('tp_settings_section');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('tomodachi:settings-section', on);
    return () => window.removeEventListener('tomodachi:settings-section', on);
  }, []);
  const [repos, setRepos] = useState<string[]>(loadRepos);
  const [input, setInput] = useState('');
  const [activeRepoUrl, setActiveRepoUrl] = useState<string>('');
  const [extensions, setExtensions] = useState<ExtensionRepo[]>([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [extensionSearch, setExtensionSearch] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'manga' | 'anime'>('all');

  // NHentai API Key state
  const [apiKey, setApiKey] = useState<string>(() => {
    return getNHentaiToken() || DEFAULT_API_KEY;
  });
  const [keySavedNotice, setKeySavedNotice] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleFactoryReset = async () => {
    setIsResetting(true);
    try {
      const resetFn =
        window.electronAPI?.factoryReset ||
        window.electronAPI?.resetFactory ||
        window.api?.factoryReset ||
        window.api?.resetFactory;
      if (resetFn) {
        await resetFn();
      }

      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }

      window.location.reload();
    } catch (err: any) {
      console.error('Erro ao restaurar de fábrica:', err);
      toast.error(t('Falha ao restaurar de fábrica'), String(err?.message || err));
      setIsResetting(false);
    }
  };

  // (A lista antiga de repositórios saiu daqui: agora fica em Explorar → Extensões.)
  void activeRepoUrl;

  const addRepo = (urlToAdd?: string) => {
    const target = (urlToAdd || input).trim();
    if (!target || repos.includes(target)) return;
    const next = [...repos, target];
    setRepos(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setInput('');
    loadRepo(target);
  };

  const removeRepo = (url: string) => {
    const next = repos.filter((r) => r !== url);
    setRepos(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (activeRepoUrl === url) {
      if (next.length > 0) {
        loadRepo(next[0]);
      } else {
        setActiveRepoUrl('');
        setExtensions([]);
      }
    }
  };

  const handleRestoreDefaults = () => {
    const defaultUrls = ALL_DEFAULT_REPOS.map((r) => r.url);
    setRepos(defaultUrls);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultUrls));
    if (defaultUrls.length > 0) {
      loadRepo(defaultUrls[0]);
    }
  };

  const loadRepo = async (url: string) => {
    setActiveRepoUrl(url);
    setLoadingExtensions(true);
    setRepoError(null);
    try {
      const format = url.toLowerCase().endsWith('.pb') ? 'pb' : 'json';
      const data = await fetchRepository(url, format);
      setExtensions(data);
    } catch (err: any) {
      setRepoError(tMaybe(err.message) || t('Falha ao carregar repositório'));
      setExtensions([]);
    } finally {
      setLoadingExtensions(false);
    }
  };

  const handleSaveApiKey = () => {
    setNHentaiToken(apiKey.trim());
    setKeySavedNotice(true);
    setTimeout(() => setKeySavedNotice(false), 3000);
  };

  const handleResetApiKey = () => {
    setApiKey(DEFAULT_API_KEY);
    setNHentaiToken(DEFAULT_API_KEY);
    setKeySavedNotice(true);
    setTimeout(() => setKeySavedNotice(false), 3000);
  };

  const getRepoName = (url: string) => {
    const found = ALL_DEFAULT_REPOS.find((r) => r.url === url);
    return found ? found.label : url.split('/').slice(-2).join('/');
  };

  const filteredExtensions = extensions.filter((ext) => {
    const q = extensionSearch.toLowerCase();
    return ext.name.toLowerCase().includes(q) || ext.lang.toLowerCase().includes(q) || ext.pkg.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-y-auto p-5 sm:p-6 gap-6">
      {/* Header & Sub-Navigation Tabs */}
      <div className="flex flex-col gap-4 border-b border-line pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-fg flex items-center gap-2">
              {t('Configurações do Tomodachi Player')}
            </h1>
            <p className="text-xs text-fg-muted mt-0.5">
              {t('Personalize a aparência, gerencie repositórios de extensões e configure suas credenciais.')}
            </p>
          </div>


        </div>

        <SupportBanner />

        {/* Navigation Tabs - Modern pill design, strictly NO colored borders */}
        <div className="flex items-center gap-3">
        <div 
          role="tablist"
          aria-label={t('Seções de Configuração')}
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-1 flex-1 min-w-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'appearance'}
            onClick={() => setActiveSection('appearance')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'appearance'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <Palette size={14} aria-hidden="true" />
            <span>{t('Aparência')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'repos'}
            onClick={() => setActiveSection('repos')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'repos'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <Database size={14} aria-hidden="true" />
            <span>{t('Extensões')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'suwayomi'}
            onClick={() => setActiveSection('suwayomi')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'suwayomi'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <Server size={14} aria-hidden="true" />
            <span>Suwayomi</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'accounts'}
            onClick={() => setActiveSection('accounts')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'accounts'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <Key size={14} aria-hidden="true" />
            <span>{t('Contas & Chaves de API')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'komga'}
            onClick={() => setActiveSection('komga')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'komga'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <Server size={14} aria-hidden="true" />
            <span>{t('Configurações do Komga')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'system'}
            onClick={() => setActiveSection('system')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer border shrink-0 whitespace-nowrap focus-visible:ring-1 focus-visible:ring-neutral-400 focus-visible:outline-none ${
              activeSection === 'system'
                ? 'bg-subtle text-fg border-line shadow-xs'
                : 'bg-transparent text-fg-muted border-transparent hover:bg-subtle/50 hover:text-fg'
            }`}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            <span>{t('Sistema & Reset')}</span>
          </button>
        </div>
          <div className="shrink-0">
            <LanguageDropdown />
          </div>
        </div>
      </div>

      {/* Content for Active Section */}
      {activeSection === 'appearance' && (
        <>
          <ThemeEditorTab />
        </>
      )}

      {activeSection === 'komga' && (
        <KomgaSettingsTab />
      )}

      {activeSection === 'suwayomi' && (
        <div className="max-w-3xl">
          <SuwayomiSetupPanel embedded />
        </div>
      )}

      {activeSection === 'repos' && (
        <div className="space-y-4">
        <ExtensionAutoUpdateCard />
        <div className="p-5 bg-surface rounded-lg border border-line shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <Database size={15} className="text-accent" /> {t('Repositórios e extensões')}
          </h2>
          <p className="text-xs text-fg-muted leading-relaxed max-w-2xl">
            {t('Cada seção tem o seu lugar: em Mangás, Explorar → Extensões; em Animes & Vídeos, a aba Fontes reúne extensões, plugins e addons. Para as extensões do Mihon funcionarem por completo, configure o Suwayomi.')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'mangas', view: 'repos' } }))}
              className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg font-medium cursor-pointer"
            >
              {t('Repositórios de mangá')}
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'videos', view: 'repos' } }))}
              className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg font-medium cursor-pointer"
            >
              {t('Fontes de anime')}
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('suwayomi')}
              className="h-8 px-3 rounded-md bg-accent/15 hover:bg-accent/25 text-xs text-fg font-medium cursor-pointer"
            >
              {t('Configurar Suwayomi')}
            </button>
          </div>
        </div>
        </div>
      )}

      {activeSection === 'accounts' && (
        <div className="max-w-2xl space-y-4">
          <AniListAccountCard />
          <div className="p-5 bg-surface rounded-lg border border-line space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-fg" />
                <h2 className="text-sm font-semibold text-fg">
                  {t('Chave de API & Token NHentai')}
                </h2>
              </div>
              {keySavedNotice && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                  <Check size={14} /> {t('Chave salva com sucesso!')}
                </span>
              )}
            </div>

            <p className="text-xs text-fg-muted leading-relaxed">
              {t('Informe sua chave de API pessoal obtida em sua conta no site oficial do NHentai para sincronizar favoritos online diretamente pelo aplicativo.')}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] text-fg-muted font-mono">
                {t('API Key / Token JWT:')}
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="nhk_..."
                className="w-full bg-canvas border border-line focus:border-neutral-400 rounded-md px-3 py-2 text-xs text-fg-2 outline-none font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-3.5 py-1.5 bg-success hover:bg-success-hover rounded-md text-xs text-white font-medium flex items-center gap-1.5 shadow transition-colors cursor-pointer"
              >
                <Check size={14} /> {t('Salvar Chave')}
              </button>

              <button
                type="button"
                onClick={handleResetApiKey}
                className="px-3.5 py-1.5 bg-subtle hover:bg-elevated rounded-md text-xs text-fg-2 hover:text-fg border border-line transition-colors cursor-pointer"
              >
                {t('Restaurar Chave Padrão')}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'system' && (
        <div className="max-w-2xl space-y-4">
          <div className="p-5 bg-surface rounded-lg border border-line space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
              <Cpu size={16} /> {t('Sobre o Sistema')}
            </h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-canvas rounded-md border border-line">
                <span className="text-fg-muted block text-[11px]">{t('Versão da Aplicação')}</span>
                <span className="text-fg font-mono font-medium">{APP_VERSION} (Windows x64)</span>
              </div>
              <div className="p-2.5 bg-canvas rounded-md border border-line">
                <span className="text-fg-muted block text-[11px]">{t('Ambiente')}</span>
                <span className="text-fg font-mono font-medium">Electron + Vite + React</span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-surface rounded-lg border border-line space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold text-fg">{t('Pastas do aplicativo')}</h2>
            <p className="text-xs text-fg-muted leading-relaxed">
              {t('Capítulos baixados para leitura offline e o registro de erros (útil para relatar problemas).')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.electronAPI?.openDownloadsFolder?.()}
                className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer"
              >
                {t('Abrir pasta de downloads')}
              </button>
              <button
                type="button"
                onClick={() => window.electronAPI?.openLogsFolder?.()}
                className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer"
              >
                {t('Abrir pasta de logs')}
              </button>
            </div>
          </div>

          <div className="p-5 bg-red-950/20 rounded-lg border border-red-900/60 space-y-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={18} />
              <h3 className="text-sm font-semibold">{t('Zona de Perigo: Restauração de Fábrica')}</h3>
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              {t('Limpa todas as configurações salvas, repositórios, favoritos locais, históricos e restaura o aplicativo ao seu estado original limpo.')}
            </p>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              {t('Restaurar Aplicação de Fábrica...')}
            </button>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Restauração de Fábrica */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface border border-red-800/80 rounded-lg max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950/80 border border-red-800 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-fg">
                  {t('Restaurar Aplicação de Fábrica?')}
                </h3>
                <p className="text-xs text-fg-muted">
                  {t('Isso apagará permanentemente todos os dados locais do aplicativo:')}
                </p>
              </div>
            </div>

            <div className="bg-canvas border border-line rounded-md p-3 text-xs space-y-1.5 text-fg-2">
              <div className="flex items-center gap-2 text-red-300">
                <span>•</span>
                <span>{t('Todas as bibliotecas de Mangás e Vídeos salvas')}</span>
              </div>
              <div className="flex items-center gap-2 text-red-300">
                <span>•</span>
                <span>{t('Capas de pastas personalizadas e miniaturas em cache')}</span>
              </div>
              <div className="flex items-center gap-2 text-red-300">
                <span>•</span>
                <span>{t('Histórico de leitura, progresso e marcações')}</span>
              </div>
              <div className="flex items-center gap-2 text-red-300">
                <span>•</span>
                <span>{t('Repositórios personalizados e chaves de API')}</span>
              </div>
              <div className="flex items-center gap-2 text-red-300">
                <span>•</span>
                <span>{t('Temas personalizados e preferências de interface')}</span>
              </div>
            </div>

            <p className="text-[11px] text-red-400 font-medium">
              {t('Esta ação é irreversível e o aplicativo será reiniciado imediatamente após a limpeza.')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 rounded-md bg-subtle hover:bg-elevated text-fg-2 text-xs font-semibold transition-colors cursor-pointer"
              >
                {t('Cancelar')}
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleFactoryReset}
                className="px-4 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow"
              >
                {isResetting ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>{t('Restaurando...')}</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>{t('Sim, Restaurar de Fábrica')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
