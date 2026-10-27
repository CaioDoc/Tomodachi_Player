import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  User, 
  Key, 
  LogIn, 
  LogOut, 
  Check, 
  AlertCircle, 
  Loader2, 
  X, 
  ShieldCheck, 
  Heart,
  ExternalLink
} from 'lucide-react';
import { 
  getStoredNHentaiUser, 
  setStoredNHentaiUser, 
  clearStoredNHentaiUser, 
  isNHentaiLoggedIn, 
  getUserProfile,
  getActiveApiKey,
  DEFAULT_API_KEY,
  type NHentaiUser 
} from '../api/nhentai';
import { t, tMaybe } from '../i18n';

interface NHentaiLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NHentaiLoginModal: React.FC<NHentaiLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [currentUser, setCurrentUser] = useState<NHentaiUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Manual token/key state
  const [manualKey, setManualKey] = useState('');
  const [verifyingKey, setVerifyingKey] = useState(false);

  // Sync current login state on open or storage event
  const checkAuth = async () => {
    const user = getStoredNHentaiUser();
    const token = getActiveApiKey();
    const logged = isNHentaiLoggedIn();
    setIsLoggedIn(logged);
    setCurrentUser(user);

    // If token exists but user details not cached, try fetching
    if (!user && token) {
      try {
        const profile = await getUserProfile(token);
        setStoredNHentaiUser(profile, token);
        setCurrentUser(profile);
        setIsLoggedIn(true);
      } catch {}
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessNotice(null);
      checkAuth();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleAuthChange = () => checkAuth();
    window.addEventListener('nhentai:auth-changed', handleAuthChange);
    return () => window.removeEventListener('nhentai:auth-changed', handleAuthChange);
  }, []);

  if (!isOpen) return null;

  // Handle native window login (user + pass + turnstile)
  const handleNativeWebLogin = async () => {
    setLoading(true);
    setError(null);
    setSuccessNotice(null);

    try {
      if (!window.electronAPI?.nhentaiLogin) {
        throw new Error(t('Ambiente Electron não suporta a janela de login nativa.'));
      }

      const res = await window.electronAPI.nhentaiLogin();
      if (!res.success) {
        if (res.error && !res.error.includes('fechada pelo usuário')) {
          setError(tMaybe(res.error));
        }
        setLoading(false);
        return;
      }

      const token = res.token;
      let user = res.user;

      // Fetch user profile if not returned directly
      if (!user && token) {
        try {
          user = await getUserProfile(token);
        } catch (err: any) {
          console.warn('Não foi possível obter perfil detalhado:', err);
        }
      }

      if (user || token) {
        const finalUser: NHentaiUser = user || {
          id: 0,
          username: t('Usuário NHentai')
        };
        setStoredNHentaiUser(finalUser, token);
        setCurrentUser(finalUser);
        setIsLoggedIn(true);
        setSuccessNotice(t('Conectado com sucesso como {name}!', { name: finalUser.username }));
        onSuccess?.();
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setError(err?.message || t('Falha ao autenticar na janela do NHentai'));
    } finally {
      setLoading(false);
    }
  };

  // Handle manual API key / Token verification
  const handleVerifyManualKey = async (e: React.FormEvent) => {
    e.preventDefault();
    let token = manualKey.trim();
    if (!token) {
      setError(t('Por favor, digite ou cole uma Chave de API ou Token válido.'));
      return;
    }
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim();
    }

    setVerifyingKey(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const profile = await getUserProfile(token);
      setStoredNHentaiUser(profile, token);
      setCurrentUser(profile);
      setIsLoggedIn(true);
      setManualKey('');
      setSuccessNotice(t('Chave validada! Conectado como {name}.', { name: profile.username }));
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || t('Chave ou token inválido. Verifique o valor digitado.'));
    } finally {
      setVerifyingKey(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.nhentaiLogout) {
        await window.electronAPI.nhentaiLogout();
      }
      clearStoredNHentaiUser();
      setIsLoggedIn(false);
      setCurrentUser(null);
      setSuccessNotice(t('Desconectado da conta com sucesso.'));
    } catch (err: any) {
      setError(err?.message || t('Erro ao desconectar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-150 select-none">
      <div className="bg-surface border border-line rounded-xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-canvas border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-rose-950/60 border border-rose-800/80 text-rose-400">
              <Flame size={16} />
            </div>
            <span className="font-semibold text-sm text-fg">
              {t('Conta NHentai & Favoritos')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Fechar')}
            title={t('Fechar')}
            className="text-fg-muted hover:text-white p-1 rounded hover:bg-subtle transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs text-fg-2 overflow-y-auto max-h-[80vh]">
          {/* Status Messages */}
          {error && (
            <div className="p-3 bg-rose-950/30 border border-rose-900/80 rounded-md text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-tight">{error}</div>
            </div>
          )}

          {successNotice && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-900/80 rounded-md text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <Check size={16} className="text-emerald-400 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {isLoggedIn && currentUser ? (
            /* Logged in state view */
            <div className="space-y-4">
              <div className="bg-canvas border border-line rounded-lg p-4 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 overflow-hidden shrink-0">
                  {currentUser.avatar_url ? (
                    <img 
                      src={currentUser.avatar_url.startsWith('http') ? currentUser.avatar_url : `https://i.nhentai.net/${currentUser.avatar_url}`} 
                      alt={currentUser.username} 
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  ) : (
                    <User size={24} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-fg truncate">
                      {currentUser.username}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-1.5 py-0.5 rounded font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t('Conectado')}
                    </span>
                  </div>
                  <p className="text-[11px] text-fg-muted font-mono mt-0.5">
                    ID: #{currentUser.id || '---'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-canvas border border-line-subtle rounded-lg text-xs space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-medium">
                  <Heart size={14} className="fill-rose-500" />
                  <span>{t('Favoritos ativos')}</span>
                </div>
                <p className="text-fg-muted text-[11px] leading-relaxed">
                  {t('Sua conta está conectada. Você pode visualizar, pesquisar e gerenciar sua biblioteca de favoritos diretamente na aba')}{' '}
                  <strong>{t('Meus Favoritos')}</strong> {t('no catálogo.')}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 bg-subtle hover:bg-elevated text-white rounded-md text-xs font-medium transition-colors"
                >
                  {t('Fechar')}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                  <span>{t('Desconectar conta')}</span>
                </button>
              </div>
            </div>
          ) : (
            /* Logged out: Login Options */
            <div className="space-y-4">
              {/* Option 1: Native Interactive Web Login (Recommended) */}
              <div className="bg-canvas border border-line rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                  <LogIn size={15} />
                  <span>{t('Entrar com usuário e senha (janela segura)')}</span>
                </div>

                <p className="text-[11px] text-fg-muted leading-relaxed">
                  {t('Abre a tela oficial de login do NHentai para você preencher seu usuário e senha com resolução automática da verificação Cloudflare Turnstile/Captcha.')}
                </p>

                <button
                  type="button"
                  disabled={loading}
                  onClick={handleNativeWebLogin}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-md shadow flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>{t('Aguardando login na janela...')}</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={15} />
                      <span>{t('Abrir janela de login do NHentai')}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2 text-[10px] text-fg-muted uppercase font-semibold">
                <div className="flex-1 h-px bg-elevated" />
                <span>{t('Ou conecte com chave / token')}</span>
                <div className="flex-1 h-px bg-elevated" />
              </div>

              {/* Option 2: Manual API Key / Token input */}
              <form onSubmit={handleVerifyManualKey} className="space-y-2">
                <label className="text-[11px] text-fg-muted block">
                  {t('Chave de API')} (<code className="text-rose-400 font-mono">nhk_...</code>) {t('ou token:')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    placeholder={t('nhk_... ou Bearer token')}
                    className="flex-1 bg-canvas border border-line focus:border-accent rounded-md px-3 py-1.5 text-xs text-fg outline-none font-mono"
                  />
                  <button
                    type="submit"
                    disabled={verifyingKey || !manualKey.trim()}
                    className="px-3 py-1.5 bg-subtle hover:bg-elevated border border-line text-accent hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    {verifyingKey ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />}
                    <span>{t('Conectar')}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
