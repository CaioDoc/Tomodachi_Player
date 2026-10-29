// src/components/MyAnimeListCard.tsx
// Configurações → Contas → MyAnimeList: ligar a busca no MAL e (opcional) usar a API oficial com um Client ID.

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { getMalClientId, isMalSearchEnabled, isValidMalClientId, MAL_EVENT, setMalClientId, setMalSearchEnabled, testMalClientId } from '../api/myanimelist';
import { toast } from './Feedback';
import { t } from '../i18n';

const API_CONFIG_URL = 'https://myanimelist.net/apiconfig';

const mask = (v: string) => (v.length > 8 ? `${v.slice(0, 4)}••••••••${v.slice(-4)}` : '••••');

export const MyAnimeListCard: React.FC = () => {
  const [, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(MAL_EVENT, on);
    return () => window.removeEventListener(MAL_EVENT, on);
  }, []);

  const enabled = isMalSearchEnabled();
  const saved = getMalClientId();
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmed = draft.trim();
  const looksLikeSecret = trimmed.length > 40;
  const valid = isValidMalClientId(trimmed) && !looksLikeSecret;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await testMalClientId(trimmed);
      if (!res.success && res.error === 'rejected') {
        toast.error(t('O MyAnimeList recusou esse Client ID'), t('Confira se copiou o Client ID (e não o Client Secret) da página de API do MAL.'));
        return;
      }
      setMalClientId(trimmed);
      setDraft('');
      setShow(false);
      if (res.success) toast.success(t('Client ID salvo'), t('A busca agora usa a API oficial do MyAnimeList.'));
      else toast.info(t('Client ID salvo'), t('Não deu para testar agora ({error}). Se a API oficial falhar, a busca usa o Jikan.', { error: res.error || '?' }));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setMalClientId(null);
    toast.info(t('Client ID removido'), t('A busca volta a usar o Jikan, sem chave.'));
  };

  return (
    <div className="p-5 bg-surface rounded-lg border border-line space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="h-[18px] px-1 rounded bg-[#2e51a2] text-white text-[9px] font-black flex items-center justify-center">MAL</span>
          <h2 className="text-sm font-semibold text-fg">MyAnimeList</h2>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-fg-2">{t('Buscar no MyAnimeList')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={t('Mostrar resultados do MyAnimeList na busca')}
            onClick={() => setMalSearchEnabled(!enabled)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-accent' : 'bg-elevated border border-line'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      <p className="text-xs text-fg-muted leading-relaxed">
        {t('Na aba Animes do Descobrir, a busca também mostra os resultados do MyAnimeList. Ao abrir um deles, você vai para a página completa da obra (episódios, "Assistir" e "Talvez você goste").')}
      </p>

      <div className="rounded-md bg-canvas border border-line-subtle p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-medium text-fg">{t('API oficial (opcional)')}</span>
          {saved ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] text-success-fg font-medium">
              <CheckCircle2 size={13} /> {t('Usando o seu Client ID')} <span className="font-mono text-fg-muted">{mask(saved)}</span>
            </span>
          ) : (
            <span className="text-[11.5px] text-fg-muted">{t('Sem chave: usando o Jikan (espelho público do MAL)')}</span>
          )}
        </div>
        <p className="text-[11.5px] text-fg-muted leading-relaxed">
          {t('Funciona sem configurar nada. Se quiser usar a API oficial, crie um app em myanimelist.net/apiconfig e cole aqui só o Client ID.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
              placeholder={saved ? t('Colar outro Client ID') : t('Client ID do MyAnimeList')}
              aria-label={t('Client ID do MyAnimeList')}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-8 bg-surface border border-line focus:border-accent rounded-md pl-2.5 pr-8 text-[12.5px] font-mono text-fg outline-none"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-fg-muted hover:text-fg cursor-pointer"
              aria-label={show ? t('Ocultar') : t('Mostrar')}
            >
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!valid || busy}
            className="h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? t('Testando…') : t('Testar e salvar')}
          </button>
          {saved && (
            <button type="button" onClick={remove} className="h-8 px-2.5 rounded-md text-[12px] text-fg-muted hover:text-danger-fg inline-flex items-center gap-1.5 cursor-pointer">
              <Trash2 size={13} /> {t('Remover')}
            </button>
          )}
        </div>
        {trimmed && !valid && (
          <p className="text-[11.5px] text-warning-fg flex items-start gap-1.5">
            <ShieldAlert size={13} className="shrink-0 mt-px" />
            {looksLikeSecret
              ? t('Isso parece o Client Secret. Ele não é necessário e não deve ser colado em lugar nenhum: use só o Client ID.')
              : t('O Client ID tem só letras e números (normalmente 32 caracteres).')}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-muted">
          <span>{t('O Client ID fica guardado criptografado neste computador.')}</span>
          <button
            type="button"
            onClick={() => void window.electronAPI?.openExternal?.(API_CONFIG_URL)}
            className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer"
          >
            {t('Página de API do MAL')} <ExternalLink size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};
