// src/components/BrowserExtensionsPanel.tsx
// Proteção integrada (anúncios/rastreadores) + extensões de navegador do Chrome.

import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Puzzle,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  Loader2,
  Trash2,
  Settings2,
  AlertTriangle,
  FileArchive,
  FolderOpen,
  Store,
  PanelTop,
} from 'lucide-react';
import type { AdblockSettingsInfo, BrowserExtensionInfo } from '../../electron/preload';
import { toast, confirmDialog } from './Feedback';
import { t, tMaybe, locale } from '../i18n';

export const EXTENSIONS_EVENT = 'tomodachi:browser-extensions-changed';
const emitChanged = () => window.dispatchEvent(new CustomEvent(EXTENSIONS_EVENT));

/** Lista de extensões instaladas, atualizada quando algo muda */
export function useBrowserExtensions() {
  const [list, setList] = useState<BrowserExtensionInfo[]>([]);
  const reload = useCallback(async () => {
    try {
      const l = await window.electronAPI?.extensionsList?.();
      setList(Array.isArray(l) ? l : []);
    } catch {
      setList([]);
    }
  }, []);
  useEffect(() => {
    void reload();
    window.addEventListener(EXTENSIONS_EVENT, reload);
    return () => window.removeEventListener(EXTENSIONS_EVENT, reload);
  }, [reload]);
  return { list, reload };
}

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }> = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-line'}`}
  >
    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

const fmtDate = (ts: number) => (ts ? new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : t('nunca'));

export const BrowserExtensionsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { list, reload } = useBrowserExtensions();
  const [ab, setAb] = useState<AdblockSettingsInfo | null>(null);
  const [storeInput, setStoreInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.adblockGetSettings?.().then(setAb).catch(() => {});
    const unsub = window.electronAPI?.onAdblockCountUpdated?.((count) => setAb((a) => (a ? { ...a, blockedCount: count } : a)));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (typeof unsub === 'function') unsub();
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const setAdblock = async (patch: Partial<Pick<AdblockSettingsInfo, 'enabled' | 'annoyances' | 'cosmetic' | 'popups'>>) => {
    if (!window.electronAPI?.adblockSetSettings) return;
    setBusy('adblock');
    try {
      const next = await window.electronAPI.adblockSetSettings(patch);
      setAb(next);
      if ('enabled' in patch) window.dispatchEvent(new CustomEvent('tomodachi:adblock-changed', { detail: { enabled: next.enabled, blockedCount: next.blockedCount } }));
      if ('annoyances' in patch || 'cosmetic' in patch) toast.info(t('Recarregue as páginas abertas para aplicar'));
    } finally {
      setBusy(null);
    }
  };

  const updateLists = async () => {
    setBusy('lists');
    try {
      const next = await window.electronAPI?.adblockUpdateLists?.();
      if (next) setAb(next);
      toast.success(t('Listas de bloqueio atualizadas'));
    } catch {
      toast.error(t('Não foi possível atualizar as listas'), t('Verifique a internet e tente de novo.'));
    } finally {
      setBusy(null);
    }
  };

  const afterInstall = (res: { success: boolean; data?: BrowserExtensionInfo | null; error?: string }) => {
    if (!res.success) {
      toast.error(t('Não foi possível instalar'), tMaybe(res.error));
      return;
    }
    if (!res.data) return; // cancelado
    emitChanged();
    void reload();
    if (res.data.error) toast.warning(t('"{name}" instalada, mas não carregou', { name: res.data.name }), tMaybe(res.data.error));
    else if (res.data.warnings.length) toast.warning(t('"{name}" instalada com limitações', { name: res.data.name }), tMaybe(res.data.warnings[0]));
    else toast.success(t('"{name}" instalada', { name: res.data.name }), t('Recarregue as páginas abertas para ela agir nelas.'));
  };

  const installStore = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!storeInput.trim() || !window.electronAPI?.extensionsInstallFromStore) return;
    setBusy('store');
    try {
      const res = await window.electronAPI.extensionsInstallFromStore(storeInput.trim());
      afterInstall(res);
      if (res.success) setStoreInput('');
    } finally {
      setBusy(null);
    }
  };

  const installOther = async (kind: 'file' | 'folder') => {
    const fn = kind === 'file' ? window.electronAPI?.extensionsInstallFromFile : window.electronAPI?.extensionsInstallFromFolder;
    if (!fn) return;
    setBusy(kind);
    try {
      afterInstall(await fn());
    } finally {
      setBusy(null);
    }
  };

  const toggleExt = async (ext: BrowserExtensionInfo, enabled: boolean) => {
    const res = await window.electronAPI?.extensionsSetEnabled?.(ext.key, enabled);
    if (res && !res.success) toast.error(t('Falha ao alterar a extensão'), tMaybe(res.error));
    else if (res?.data?.error) toast.warning(t('A extensão não carregou'), tMaybe(res.data.error));
    emitChanged();
  };

  const removeExt = async (ext: BrowserExtensionInfo) => {
    if (!(await confirmDialog({ title: t('Remover "{name}"?', { name: ext.name }), message: t('A extensão e os dados dela serão apagados.'), confirmLabel: t('Remover'), danger: true }))) return;
    const res = await window.electronAPI?.extensionsRemove?.(ext.key);
    if (res && !res.success) toast.error(t('Falha ao remover'), tMaybe(res.error));
    emitChanged();
  };

  const open = async (ext: BrowserExtensionInfo, what: 'popup' | 'options') => {
    const fn = what === 'popup' ? window.electronAPI?.extensionsOpenPopup : window.electronAPI?.extensionsOpenOptions;
    const res = await fn?.(ext.key);
    if (res && !res.success) toast.error(t('Não foi possível abrir'), tMaybe(res.error));
  };

  const available = !!window.electronAPI?.extensionsList;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t('Proteção e extensões')}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border border-line rounded-xl w-full max-w-3xl max-h-[86vh] flex flex-col shadow-2xl overflow-hidden animate-tp-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-canvas">
          <div className="flex items-center gap-2.5">
            <Puzzle size={19} className="text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-fg">{t('Proteção e extensões')}</h2>
              <p className="text-xs text-fg-muted">{t('Bloqueio de anúncios e rastreadores no navegador integrado')}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg p-1.5 rounded-lg hover:bg-subtle" title={t('Fechar (Esc)')}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Proteção integrada */}
          <section className="rounded-xl border border-line bg-canvas p-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${ab?.enabled ? 'bg-success/15 text-success-fg' : 'bg-danger/10 text-danger'}`}>
                {ab?.enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-fg">{t('Proteção integrada (recomendada)')}</h3>
                  <Toggle label={t('Ativar proteção integrada')} checked={!!ab?.enabled} disabled={!ab || busy === 'adblock'} onChange={(v) => void setAdblock({ enabled: v })} />
                </div>
                <p className="text-xs text-fg-muted mt-0.5">
                  {t('Mesmas listas do uBlock Origin (EasyList, EasyPrivacy, uBlock filters).')} {ab ? <b className="text-fg-2">{t('{n} bloqueios nesta sessão.', { n: ab.blockedCount.toLocaleString(locale) })}</b> : null}
                </p>
              </div>
            </div>

            {ab && (
              <div className="mt-4 space-y-2.5 pl-[52px]">
                {(
                  [
                    ['cosmetic', t('Esconder espaços de anúncio e banners'), t('Remove os quadros vazios e roda os ajustes contra "desative seu bloqueador".')],
                    ['popups', t('Bloquear pop-ups de anúncio'), t('Impede abas/janelas de propaganda abertas pelos sites.')],
                    ['annoyances', t('Bloquear avisos de cookies e incômodos'), t('Usa também as listas "Annoyances". Pode afetar alguns sites.')],
                  ] as const
                ).map(([k, title, desc]) => (
                  <label key={k} className="flex items-start gap-3 cursor-pointer">
                    <div className="flex-1">
                      <div className="text-xs text-fg">{title}</div>
                      <div className="text-[11px] text-fg-muted">{desc}</div>
                    </div>
                    <Toggle label={title} checked={!!ab[k]} disabled={!ab.enabled || busy === 'adblock'} onChange={(v) => void setAdblock({ [k]: v })} />
                  </label>
                ))}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-fg-muted">
                    {t('Listas atualizadas: {date} · atualização automática a cada 7 dias', { date: fmtDate(ab.listsUpdatedAt) })}
                  </span>
                  <button
                    type="button"
                    onClick={updateLists}
                    disabled={busy === 'lists' || ab.updating}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-subtle hover:bg-elevated border border-line text-[11px] text-fg-2 disabled:opacity-60"
                  >
                    {busy === 'lists' || ab.updating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {t('Atualizar agora')}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Instalar */}
          <section>
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wider mb-2">{t('Instalar extensão')}</h3>
            {!available ? (
              <p className="text-xs text-fg-muted">{t('Disponível no aplicativo instalado.')}</p>
            ) : (
              <>
                <form onSubmit={installStore} className="flex gap-2">
                  <div className="relative flex-1">
                    <Store size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                    <input
                      value={storeInput}
                      onChange={(e) => setStoreInput(e.target.value)}
                      placeholder={t('Cole o link da Chrome Web Store (chromewebstore.google.com/detail/…)')}
                      className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-9 pr-3 py-2 text-xs text-fg outline-none placeholder-fg-muted"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!storeInput.trim() || busy === 'store'}
                    className="px-4 py-2 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {busy === 'store' && <Loader2 size={13} className="animate-spin" />} {t('Instalar')}
                  </button>
                </form>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => void installOther('file')}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg-2 disabled:opacity-60"
                  >
                    {busy === 'file' ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />} {t('Arquivo .crx ou .zip')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void installOther('folder')}
                    disabled={!!busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg-2 disabled:opacity-60"
                  >
                    {busy === 'folder' ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />} {t('Pasta descompactada')}
                  </button>
                </div>
                <p className="text-[11px] text-fg-muted mt-2 leading-relaxed">
                  {t(
                    'O navegador integrado usa o Electron, que só tem parte dos recursos de extensão do Chrome. Funcionam melhor as extensões que alteram páginas (ex.: modo escuro, pular patrocínios, ajustes de sites). Bloqueadores feitos para o Chrome novo, como o uBlock Origin Lite, não conseguem bloquear aqui — para isso use a proteção integrada acima.'
                  )}
                </p>
              </>
            )}
          </section>

          {/* Instaladas */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-fg uppercase tracking-wider">{t('Instaladas ({n})', { n: list.length })}</h3>
              {available && (
                <button type="button" onClick={() => void window.electronAPI?.extensionsOpenFolder?.()} className="text-[11px] text-fg-muted hover:text-fg hover:underline">
                  {t('Abrir pasta')}
                </button>
              )}
            </div>
            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-fg-muted">{t('Nenhuma extensão instalada.')}</div>
            ) : (
              <div className="rounded-xl border border-line-subtle divide-y divide-line-subtle bg-canvas">
                {list.map((ext) => (
                  <div key={ext.key} className="p-3 flex items-start gap-3">
                    {ext.icon ? (
                      <img src={ext.icon} alt="" className={`w-9 h-9 rounded-lg object-contain shrink-0 ${ext.enabled ? '' : 'grayscale opacity-60'}`} />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-subtle flex items-center justify-center text-fg-muted shrink-0">
                        <Puzzle size={16} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[13px] font-medium truncate ${ext.enabled ? 'text-fg' : 'text-fg-muted'}`}>{ext.name}</span>
                        <span className="text-[10px] text-fg-muted font-mono">v{ext.version}</span>
                        <span className="text-[10px] px-1.5 rounded bg-subtle text-fg-muted">MV{ext.manifestVersion}</span>
                      </div>
                      {ext.description && <p className="text-[11px] text-fg-muted line-clamp-2 mt-0.5">{ext.description}</p>}
                      {ext.enabled && ext.error && (
                        <p className="text-[11px] text-danger mt-1 flex items-start gap-1">
                          <AlertTriangle size={12} className="shrink-0 mt-px" /> {t('Não carregou: {error}', { error: tMaybe(ext.error) })}
                        </p>
                      )}
                      {ext.warnings.map((w, i) => (
                        <p key={i} className="text-[11px] text-warning-fg mt-1 flex items-start gap-1">
                          <AlertTriangle size={12} className="shrink-0 mt-px" /> {tMaybe(w)}
                        </p>
                      ))}
                      {ext.enabled && ext.loaded && (ext.popup || ext.options) && (
                        <div className="flex items-center gap-2 mt-2">
                          {ext.popup && (
                            <button type="button" onClick={() => void open(ext, 'popup')} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-subtle hover:bg-elevated text-[11px] text-fg-2">
                              <PanelTop size={12} /> {t('Abrir painel')}
                            </button>
                          )}
                          {ext.options && (
                            <button type="button" onClick={() => void open(ext, 'options')} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-subtle hover:bg-elevated text-[11px] text-fg-2">
                              <Settings2 size={12} /> {t('Opções')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Toggle label={t('Ativar {name}', { name: ext.name })} checked={ext.enabled} onChange={(v) => void toggleExt(ext, v)} />
                      <button type="button" onClick={() => void removeExt(ext)} className="p-1.5 rounded text-fg-muted hover:text-danger hover:bg-danger/10" title={t('Remover')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
