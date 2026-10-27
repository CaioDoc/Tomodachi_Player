// src/components/SuwayomiSetup.tsx
// Configuração do Suwayomi (usada em Explorar → Suwayomi → Conexão e em Configurações → Suwayomi):
// explicação, repositórios de extensões com "copiar", executável e início automático.

import React, { useEffect, useState } from 'react';
import {
  Settings2,
  ExternalLink,
  Plug,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Puzzle,
  Loader2,
  Copy,
  Check,
  Server,
  Plus,
  Info,
  Play,
} from 'lucide-react';
import { toast, confirmDialog } from './Feedback';
import {
  getSuwayomiConfig,
  saveSuwayomiConfig,
  testConnection,
  ensureServerRunning,
  addExtensionRepo,
  SUWAYOMI_EVENT,
  DEFAULT_SUWAYOMI_URL,
  SUWAYOMI_DOWNLOAD_URL,
  type SuwayomiConfig,
} from '../api/suwayomi';
import { t } from '../i18n';

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
  else window.open(url, '_blank', 'noopener');
};

/** Abre Configurações → Suwayomi */
export function openSuwayomiSettings() {
  try {
    sessionStorage.setItem('tp_settings_section', 'suwayomi');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'settings-repos', section: 'suwayomi' } }));
}

/** Repositórios de extensões do Mihon para colar no Suwayomi (Launcher → Extension → Extension stores) */
export const SUWAYOMI_EXTENSION_STORES: { name: string; site?: string; url: string; note?: string }[] = [
  { name: 'Keiyoushi', site: 'https://keiyoushi.github.io/', url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb', note: 'principal' },
  { name: 'FAKKU', site: 'https://github.com/mojuru/cursed-manga-repo', url: 'https://raw.githubusercontent.com/mojuru/cursed-manga-repo/repo/index.pb', note: '+18' },
  { name: 'Kavita', url: 'https://raw.githubusercontent.com/Kareadita/tach-extension/repo/index.min.json' },
  { name: 'Suwayomi', url: 'https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json' },
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Lista de repositórios com copiar e "adicionar ao servidor" */
export const ExtensionStoreLinks: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [connected, setConnected] = useState(() => !!getSuwayomiConfig());

  useEffect(() => {
    const on = () => setConnected(!!getSuwayomiConfig());
    window.addEventListener(SUWAYOMI_EVENT, on);
    return () => window.removeEventListener(SUWAYOMI_EVENT, on);
  }, []);

  const copy = async (url: string) => {
    if (await copyText(url)) {
      setCopied(url);
      window.setTimeout(() => setCopied((c) => (c === url ? null : c)), 1800);
    } else toast.error(t('Não foi possível copiar'));
  };

  const addToServer = async (name: string, url: string) => {
    setAdding(url);
    try {
      const ok = await ensureServerRunning(30000);
      if (!ok) throw new Error(t('O Suwayomi não está respondendo. Abra o servidor e tente de novo.'));
      await addExtensionRepo(url);
      toast.success(t('Repositório adicionado ao Suwayomi'), name);
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Já cadastrado conta como sucesso
      if (/already|exist|duplic/i.test(msg)) toast.info(t('Esse repositório já está no Suwayomi'), name);
      else toast.error(t('Não foi possível adicionar'), msg);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className={`rounded-xl border border-line-subtle bg-surface ${compact ? 'p-4' : 'p-5'} space-y-3`}>
      <div>
        <h3 className="text-[14px] font-semibold text-fg flex items-center gap-2">
          <Puzzle size={16} className="text-accent" /> {t('Repositórios de extensões')}
        </h3>
        <p className="text-[12px] text-fg-muted mt-1 leading-relaxed">
          {t('Copie e cole no Suwayomi: no Launcher, aba “Extension” → campo “Extension stores” → “Add” (ou na interface web: Configurações → Navegar → Repositórios). Com o servidor conectado, use “Adicionar” para fazer isso daqui.')}
        </p>
      </div>
      <div className="divide-y divide-line-subtle rounded-lg border border-line-subtle overflow-hidden">
        {SUWAYOMI_EXTENSION_STORES.map((r) => (
          <div key={r.url} className="flex items-center gap-3 px-3 py-2.5 bg-canvas/40">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-fg">{r.name}</span>
                {r.note && (
                  <span className={`text-[10px] px-1.5 rounded ${r.note === '+18' ? 'bg-danger/15 text-danger-fg' : 'bg-accent/15 text-fg'}`}>
                    {r.note === 'principal' ? t('principal') : r.note}
                  </span>
                )}
                {r.site && (
                  <button type="button" onClick={() => openExternal(r.site!)} className="text-fg-muted hover:text-fg cursor-pointer" title={t('Abrir site')} aria-label={t('Abrir site')}>
                    <ExternalLink size={12} />
                  </button>
                )}
              </div>
              <code className="block text-[11px] text-fg-muted truncate select-all" title={r.url}>
                {r.url}
              </code>
            </div>
            <button
              type="button"
              onClick={() => void copy(r.url)}
              className={`h-8 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer border shrink-0 ${
                copied === r.url ? 'border-success/50 bg-success/10 text-fg' : 'border-line bg-subtle hover:bg-elevated text-fg-2 hover:text-fg'
              }`}
              aria-label={t('Copiar link de {name}', { name: r.name })}
            >
              {copied === r.url ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              {copied === r.url ? t('Copiado') : t('Copiar')}
            </button>
            {connected && (
              <button
                type="button"
                onClick={() => void addToServer(r.name, r.url)}
                disabled={!!adding}
                title={t('Adicionar este repositório ao Suwayomi')}
                className="h-8 px-2.5 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer bg-accent/15 hover:bg-accent/25 text-fg shrink-0 disabled:opacity-50"
              >
                {adding === r.url ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                {t('Adicionar')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Explicação: por que o Suwayomi é necessário e como configurar */
export const SuwayomiExplainer: React.FC = () => (
  <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 space-y-3">
    <h3 className="text-[15px] font-semibold text-fg flex items-center gap-2">
      <Server size={17} className="text-accent" /> {t('Para usar as extensões do Mihon você precisa do Suwayomi')}
    </h3>
    <p className="text-[13px] text-fg-2 leading-relaxed">
      {t('As extensões do Mihon/Tachiyomi (Keiyoushi e outras) são programas feitos para Android — o Tomodachi Player não consegue rodá-las sozinho. O Suwayomi é um servidor gratuito que roda essas mesmas extensões no seu computador; o Tomodachi conversa com ele e mostra tudo na própria interface.')}
    </p>
    <ul className="text-[12.5px] text-fg-muted space-y-1 list-disc list-inside">
      <li>{t('Sem o Suwayomi, a aba Extensões só lista as fontes e o app tenta ler os sites de forma genérica — muitos sites não funcionam assim.')}</li>
      <li>{t('Com o Suwayomi, busca, capítulos e páginas vêm das extensões oficiais, como no celular.')}</li>
      <li>{t('Serve só para mangás. Animes usam as extensões do app ou a aba Nuvio.')}</li>
    </ul>
    <ol className="text-[12.5px] text-fg-2 space-y-1.5 list-decimal list-inside">
      <li>
        {t('Baixe a versão para Windows')} (<code className="text-fg-muted">Suwayomi-Server-…-windows-x64.zip</code>, {t('já vem com Java')}) {t('e extraia numa pasta.')}
      </li>
      <li>{t('Abra o “Suwayomi Launcher”, vá na aba “Extension” e adicione os repositórios da lista abaixo (botão Copiar). Depois clique em “Launch”.')}</li>
      <li>{t('Aqui, indique o executável do Suwayomi e marque “Iniciar automaticamente” para ele abrir junto com o Tomodachi.')}</li>
      <li>{t('Clique em “Testar conexão” e “Salvar”. Depois instale as fontes em Mangás & Comics → Explorar → Suwayomi → Extensões.')}</li>
    </ol>
    <button
      type="button"
      onClick={() => openExternal(SUWAYOMI_DOWNLOAD_URL)}
      className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
    >
      <ExternalLink size={13} /> {t('Baixar o Suwayomi')}
    </button>
  </div>
);

/** Conexão + executável + início automático */
export const SuwayomiSetupPanel: React.FC<{ onSaved?: () => void; firstRun?: boolean; embedded?: boolean }> = ({ onSaved, firstRun, embedded }) => {
  const current = getSuwayomiConfig();
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl || DEFAULT_SUWAYOMI_URL);
  const [username, setUsername] = useState(current?.username || '');
  const [password, setPassword] = useState(current?.password || '');
  const [exePath, setExePath] = useState(current?.exePath || '');
  const [autoStart, setAutoStart] = useState(current?.autoStart ?? true);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [showIntro, setShowIntro] = useState(!!firstRun || !current);

  const cfg = (): SuwayomiConfig => ({
    baseUrl: baseUrl.trim() || DEFAULT_SUWAYOMI_URL,
    username: username.trim() || undefined,
    password: password || undefined,
    exePath: exePath.trim() || undefined,
    autoStart,
  });

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const v = await testConnection(cfg());
      setResult({ ok: true, text: t('Conectado: {version}', { version: v }) });
    } catch (err: any) {
      setResult({ ok: false, text: err?.message || String(err) });
    } finally {
      setTesting(false);
    }
  };

  const pickExe = async () => {
    const picked = await window.electronAPI?.openFileDialog?.({
      title: t('Selecione o executável do Suwayomi'),
      filters: [
        { name: 'Suwayomi', extensions: ['exe', 'bat', 'cmd', 'jar'] },
        { name: t('Todos os arquivos'), extensions: ['*'] },
      ],
    });
    if (picked) setExePath(picked);
  };

  const save = () => {
    saveSuwayomiConfig(cfg());
    toast.success(
      t('Configuração do Suwayomi salva'),
      autoStart && exePath.trim() ? t('Ele vai iniciar junto com o Tomodachi Player.') : undefined
    );
    onSaved?.();
  };

  const startNow = async () => {
    saveSuwayomiConfig(cfg());
    setStarting(true);
    setResult(null);
    try {
      const ok = await ensureServerRunning(60000);
      setResult(ok ? { ok: true, text: t('Suwayomi iniciado e conectado.') } : { ok: false, text: t('Não foi possível iniciar o Suwayomi. Confira o executável e tente abrir pelo Launcher.') });
    } finally {
      setStarting(false);
    }
  };

  const input = 'mt-1 w-full h-9 bg-canvas border border-line-subtle focus:border-accent rounded-md px-3 text-[13px] text-fg outline-none';

  return (
    <div className={embedded ? 'space-y-5' : 'max-w-2xl mx-auto px-4 py-6 space-y-5'}>
      {showIntro ? (
        <SuwayomiExplainer />
      ) : (
        <button type="button" onClick={() => setShowIntro(true)} className="text-[12px] text-fg-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer">
          <Info size={13} /> {t('Por que preciso do Suwayomi?')}
        </button>
      )}

      <div className="rounded-xl border border-line-subtle bg-surface p-5 space-y-4">
        <h3 className="text-[14px] font-semibold text-fg flex items-center gap-2">
          <Settings2 size={16} /> {t('Conexão')}
        </h3>

        <div className="rounded-lg border border-line-subtle bg-canvas/40 p-3">
          <span className="text-[12.5px] font-medium text-fg">{t('Executável do Suwayomi')}</span>
          <p className="text-[11.5px] text-fg-muted mt-0.5">
            {t('Ex.:')} <code>Suwayomi Launcher.exe</code>, <code>suwayomi-server.bat</code> {t('ou o arquivo')} <code>.jar</code>.{' '}
            {t('Prefira o que tem “server” no nome: ele sobe direto, sem abrir a janela do Launcher.')}
          </p>
          <div className="mt-2 flex gap-2">
            <input value={exePath} onChange={(e) => setExePath(e.target.value)} placeholder={t('Nenhum executável selecionado')} className="flex-1 min-w-0 h-9 bg-canvas border border-line-subtle focus:border-accent rounded-md px-3 text-[12.5px] text-fg outline-none" spellCheck={false} />
            <button type="button" onClick={pickExe} className="h-9 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0">
              <FolderOpen size={13} /> {t('Escolher')}
            </button>
          </div>
          <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-fg-2 cursor-pointer select-none">
            <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)} className="accent-[rgb(var(--c-accent))]" />
            {t('Iniciar automaticamente ao abrir o Tomodachi Player')}
          </label>
          {autoStart && !exePath.trim() && <p className="text-[11.5px] text-warning-fg mt-1">{t('Escolha o executável para o início automático funcionar.')}</p>}
        </div>

        <label className="block">
          <span className="text-[12px] text-fg-muted">{t('Endereço do servidor')}</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_SUWAYOMI_URL} className={input} spellCheck={false} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[12px] text-fg-muted">{t('Usuário (opcional)')}</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={input} autoComplete="off" />
          </label>
          <label className="block">
            <span className="text-[12px] text-fg-muted">{t('Senha (opcional)')}</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} autoComplete="off" />
          </label>
        </div>
        <p className="text-[11.5px] text-fg-muted -mt-2">{t('Usuário e senha só são necessários se você ativou “Basic Auth” no Suwayomi.')}</p>

        {result && (
          <div className={`flex items-start gap-2 text-[12.5px] rounded-md px-3 py-2 ${result.ok ? 'bg-success/10 text-success-fg' : 'bg-danger/10 text-danger-fg'}`}>
            {result.ok ? <CheckCircle2 size={15} className="shrink-0 mt-px" /> : <AlertCircle size={15} className="shrink-0 mt-px" />}
            <span>{result.text}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={runTest} disabled={testing} className="h-9 px-4 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />} {t('Testar conexão')}
          </button>
          {exePath.trim() && (
            <button type="button" onClick={startNow} disabled={starting} className="h-9 px-4 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {t('Iniciar agora')}
            </button>
          )}
          <button type="button" onClick={save} className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold cursor-pointer">
            {t('Salvar')}
          </button>
          {current && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog({ title: t('Desconectar o Suwayomi?'), message: t('As obras já adicionadas à biblioteca continuam lá, mas só abrem com o servidor conectado.'), confirmLabel: t('Desconectar'), danger: true })) {
                  saveSuwayomiConfig(null);
                  onSaved?.();
                }
              }}
              className="h-9 px-3 rounded-md text-fg-muted hover:text-danger-fg text-xs font-medium cursor-pointer ml-auto"
            >
              {t('Desconectar')}
            </button>
          )}
        </div>
      </div>

      <ExtensionStoreLinks />
    </div>
  );
};
