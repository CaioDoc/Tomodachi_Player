// src/components/LanguagePicker.tsx
// Seletor de idioma da interface (Configurações e tela de boas-vindas).

import React, { useEffect, useRef, useState } from 'react';
import { Languages, Check, ChevronDown } from 'lucide-react';
import { LANGUAGES, lang, setLanguage, t, type Lang } from '../i18n';
import { confirmDialog } from './Feedback';

/** Muda o idioma (a interface recarrega; as abas abertas são restauradas). */
export async function changeLanguage(next: Lang, ask = true) {
  if (next === lang) return;
  if (ask) {
    const target = LANGUAGES.find((l) => l.id === next)?.label || next;
    const ok = await confirmDialog({
      title: t('Mudar o idioma para {lang}?', { lang: target }),
      message: t('A interface será recarregada. Suas abas abertas serão restauradas.'),
      confirmLabel: t('Mudar idioma'),
    });
    if (!ok) return;
  }
  setLanguage(next);
}

export const LanguagePicker: React.FC<{ compact?: boolean; ask?: boolean }> = ({ compact = false, ask = true }) => (
  <div role="radiogroup" aria-label={t('Idioma')} className={`flex ${compact ? 'gap-1.5' : 'flex-wrap gap-2'}`}>
    {LANGUAGES.map((l) => {
      const active = l.id === lang;
      return (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => void changeLanguage(l.id, ask)}
          className={`inline-flex items-center gap-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
            compact ? 'px-2.5 py-1.5' : 'px-3.5 py-2'
          } ${active ? 'bg-accent/15 border-accent text-fg' : 'bg-canvas border-line text-fg-2 hover:bg-subtle hover:text-fg'}`}
        >
          <span aria-hidden className="text-base leading-none">
            {l.flag}
          </span>
          <span>{l.label}</span>
          {active && <Check size={13} className="text-accent" />}
        </button>
      );
    })}
  </div>
);

/** Cartão de idioma para a tela de Configurações */
export const LanguageCard: React.FC = () => (
  <div className="p-5 bg-surface rounded-lg border border-line space-y-3 shadow-sm mb-6">
    <div className="flex items-center gap-2">
      <Languages size={18} className="text-fg" />
      <h2 className="text-sm font-semibold text-fg">{t('Idioma')}</h2>
      <span className="text-[11px] text-fg-muted">· Language · Idioma</span>
    </div>
    <p className="text-xs text-fg-muted">{t('Escolha o idioma da interface do Tomodachi Player.')}</p>
    <LanguagePicker />
  </div>
);

/** Seletor de idioma compacto (menu) — canto superior direito das Configurações */
export const LanguageDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.id === lang) || LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('Idioma')}
        title={`${t('Idioma')} · Language · Idioma`}
        className="flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium border border-line bg-surface hover:bg-subtle text-fg cursor-pointer"
      >
        <Languages size={14} className="text-fg-muted" />
        <span aria-hidden className="text-sm leading-none">
          {current.flag}
        </span>
        <span>{current.label}</span>
        <ChevronDown size={13} className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" aria-label={t('Idioma')} className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] p-1 rounded-lg border border-line bg-surface shadow-pop">
          {LANGUAGES.map((l) => {
            const active = l.id === lang;
            return (
              <li key={l.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void changeLanguage(l.id, true);
                  }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-left cursor-pointer ${active ? 'bg-accent/15 text-fg' : 'text-fg-2 hover:bg-subtle hover:text-fg'}`}
                >
                  <span aria-hidden className="text-base leading-none">
                    {l.flag}
                  </span>
                  <span className="flex-1">{l.label}</span>
                  {active && <Check size={13} className="text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
