// src/components/SupportBanner.tsx
// Banner (slider) das Configurações com a Ina e a Jun (artes com fundo removido):
//  1. Projeto / GitHub — Jun num canto, Ina no outro, texto no centro
//  2. Doação (o principal) — as duas pedindo juntas, corações, texto no centro
//  3. Novidades — só a Ina apontando para o texto
// Os textos seguem o idioma do app.

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Github, Heart, Sparkles, Star } from 'lucide-react';
import { GITHUB_URL, SUPPORT_URL, SUPPORT_FOCUS_EVENT, openExternalUrl } from '../constants/support';
import { t } from '../i18n';
import { useIsTabActive } from '../context/TabContext';
import junShy from '../img/banner/jun_shy.webp';
import junHeart from '../img/banner/jun_heart.webp';
import inaWink from '../img/banner/ina_wink.webp';
import inaHeart from '../img/banner/ina_heart.webp';
import inaPoint from '../img/banner/ina_point.webp';

interface Character {
  src: string;
  side: 'left' | 'right';
  /** Deslocamento para fora da borda (a asa de fora pode ficar cortada) */
  offset: number;
  /** Altura da arte em px (a cabeça fica inteira no topo; o resto sai pela base, que esfuma) */
  height: number;
  /** Largura/altura da arte (para posicionar o texto ao lado) */
  aspect: number;
  /** Mostrar só em telas largas (a 2ª personagem some primeiro) */
  wideOnly?: boolean;
}

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  note?: string;
  cta?: { label: string; icon: React.ReactNode; onClick: () => void; primary?: boolean };
  chars: Character[];
  /** Onde fica o texto */
  align: 'center' | 'after';
  glow: string;
  decor: { icon: 'heart' | 'star' | 'sparkle'; x: string; y: string; s: number; d: number }[];
}

const BANNER_H = 232;
const AUTOPLAY_MS = 8000;

export const SupportBanner: React.FC = () => {
  const slides: Slide[] = [
    {
      id: 'project',
      eyebrow: t('Projeto aberto'),
      title: t('Feito com amor (e café)'),
      subtitle: t('Acesse nosso GitHub e acompanhe o desenvolvimento'),
      cta: GITHUB_URL ? { label: t('Ver no GitHub'), icon: <Github size={15} />, onClick: () => openExternalUrl(GITHUB_URL) } : undefined,
      chars: [
        { src: junShy, side: 'left', offset: -120, height: 300, aspect: 1.47 },
        { src: inaWink, side: 'right', offset: -24, height: 300, aspect: 1.133, wideOnly: true },
      ],
      align: 'center',
      glow: 'radial-gradient(38% 120% at 12% 60%, rgba(236,72,153,0.30), transparent 70%), radial-gradient(38% 120% at 88% 60%, rgba(217,70,239,0.28), transparent 70%)',
      decor: [
        { icon: 'star', x: '30%', y: '16%', s: 9, d: 0 },
        { icon: 'star', x: '70%', y: '78%', s: 8, d: 1.2 },
        { icon: 'star', x: '64%', y: '14%', s: 7, d: 0.6 },
      ],
    },
    {
      id: 'donate',
      eyebrow: t('Apoie o Tomodachi Player'),
      title: t('Ajude a manter o app no ar'),
      subtitle: t('Seu apoio paga o servidor, a internet e o café das criadoras'),
      note: t('Qualquer valor já ajuda muito'),
      cta: SUPPORT_URL ? { label: t('Fazer uma doação'), icon: <Heart size={15} fill="currentColor" />, onClick: () => openExternalUrl(SUPPORT_URL), primary: true } : undefined,
      chars: [
        { src: junHeart, side: 'left', offset: -96, height: 262, aspect: 1.63 },
        { src: inaHeart, side: 'right', offset: -12, height: 300, aspect: 1.12, wideOnly: true },
      ],
      align: 'center',
      glow: 'radial-gradient(45% 130% at 15% 60%, rgba(244,63,94,0.34), transparent 70%), radial-gradient(45% 130% at 85% 60%, rgba(236,72,153,0.34), transparent 70%), radial-gradient(30% 60% at 50% 0%, rgba(236,72,153,0.18), transparent 70%)',
      decor: [
        { icon: 'heart', x: '29%', y: '20%', s: 14, d: 0 },
        { icon: 'heart', x: '33%', y: '70%', s: 10, d: 0.9 },
        { icon: 'heart', x: '68%', y: '14%', s: 12, d: 0.4 },
        { icon: 'heart', x: '71%', y: '74%', s: 9, d: 1.4 },
        { icon: 'heart', x: '50%', y: '8%', s: 8, d: 0.7 },
      ],
    },
    {
      id: 'news',
      eyebrow: t('Sempre evoluindo'),
      title: t('Novidades toda semana'),
      subtitle: t('Estamos sempre adicionando mangás e melhorias'),
      note: t('Fique de olho nas atualizações'),
      cta: GITHUB_URL ? { label: t('Ver novidades'), icon: <Sparkles size={15} />, onClick: () => openExternalUrl(`${GITHUB_URL.replace(/\/+$/, '')}/releases`) } : undefined,
      chars: [{ src: inaPoint, side: 'left', offset: 20, height: 300, aspect: 0.988 }],
      align: 'after',
      glow: 'radial-gradient(45% 130% at 20% 60%, rgba(217,70,239,0.32), transparent 70%), radial-gradient(40% 100% at 85% 40%, rgba(236,72,153,0.16), transparent 70%)',
      decor: [
        { icon: 'sparkle', x: '40%', y: '18%', s: 13, d: 0.2 },
        { icon: 'sparkle', x: '46%', y: '72%', s: 10, d: 1 },
        { icon: 'sparkle', x: '93%', y: '16%', s: 11, d: 0.5 },
      ],
    },
  ];

  const [index, setIndex] = useState(() => {
    try {
      if (sessionStorage.getItem('tp_support_focus')) {
        sessionStorage.removeItem('tp_support_focus');
        return 1;
      }
    } catch {
      /* ignore */
    }
    return 0;
  });
  const [paused, setPaused] = useState(false);
  // Aba das Configurações escondida: não fica trocando de slide à toa
  const tabActive = useIsTabActive();
  // Abaixo de 1024px só a 1ª personagem aparece: o texto vai para o lado dela
  const mqMatch = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : true);
  const [wide, setWide] = useState(() => mqMatch('(min-width: 1024px)'));
  const [smUp, setSmUp] = useState(() => mqMatch('(min-width: 640px)'));
  useEffect(() => {
    if (!window.matchMedia) return;
    const a = window.matchMedia('(min-width: 1024px)');
    const b = window.matchMedia('(min-width: 640px)');
    const on = () => {
      setWide(a.matches);
      setSmUp(b.matches);
    };
    a.addEventListener?.('change', on);
    b.addEventListener?.('change', on);
    return () => {
      a.removeEventListener?.('change', on);
      b.removeEventListener?.('change', on);
    };
  }, []);
  const go = useCallback((i: number) => setIndex((i + slides.length) % slides.length), [slides.length]);

  // Botão "Doar" sem link: mostra o slide de doação
  useEffect(() => {
    const on = () => {
      setIndex(1);
      try {
        sessionStorage.removeItem('tp_support_focus');
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(SUPPORT_FOCUS_EVENT, on);
    return () => window.removeEventListener(SUPPORT_FOCUS_EVENT, on);
  }, []);

  useEffect(() => {
    if (paused || !tabActive) return;
    const id = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, tabActive, go]);

  const fadeLeftEdge = 'linear-gradient(to right, transparent 0%, #000 7%)';
  const fadeRightEdge = 'linear-gradient(to left, transparent 0%, #000 7%)';

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('Apoie o Tomodachi Player')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="group relative w-full overflow-hidden rounded-2xl border border-white/10 shadow-pop select-none"
      style={{ height: BANNER_H, background: 'linear-gradient(120deg, #0b0710 0%, #140a17 55%, #1c0b1d 100%)' }}
    >
      {slides.map((s, i) => {
        const active = i === index;
        // Sem espaço para as duas: o texto sai do centro e fica ao lado da personagem que aparece
        const align = s.align === 'center' && !wide ? 'after' : s.align;
        return (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${slides.length}`}
            aria-hidden={!active}
            className="absolute inset-0 transition-opacity duration-700 ease-out"
            style={{ opacity: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none' }}
          >
            {/* brilho neon + pontinhos */}
            <div className="absolute inset-0" style={{ background: s.glow }} aria-hidden />
            <div
              className="absolute inset-0 opacity-[0.06]"
              aria-hidden
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            />

            {/* personagens (fundo removido, presas aos cantos) */}
            {s.chars.map((c, k) => (
              <img
                key={c.src}
                src={c.src}
                alt=""
                aria-hidden
                draggable={false}
                className={`absolute w-auto max-w-none pointer-events-none transition-all duration-700 ease-out ${c.wideOnly ? 'hidden lg:block' : 'hidden sm:block'}`}
                style={{
                  [c.side]: c.offset,
                  top: 6,
                  height: c.height,
                  transform: active ? 'translateY(0)' : `translateY(${18 + k * 6}px)`,
                  opacity: active ? 1 : 0,
                  transitionDelay: active ? `${100 + k * 140}ms` : '0ms',
                  filter: 'drop-shadow(0 0 22px rgba(236,72,153,0.35))',
                  // some na base e na borda de dentro (algumas artes têm a asa cortada no quadro)
                  WebkitMaskImage: c.side === 'right' ? fadeLeftEdge : fadeRightEdge,
                  maskImage: c.side === 'right' ? fadeLeftEdge : fadeRightEdge,
                }}
              />
            ))}

            {/* a base das personagens se dissolve no fundo do banner */}
            <div className="absolute inset-x-0 bottom-0 h-12 pointer-events-none" aria-hidden style={{ background: 'linear-gradient(to top, #120916 10%, rgba(18,9,22,0))' }} />

            {/* decoração */}
            <div className="absolute inset-0 hidden sm:block pointer-events-none" aria-hidden>
              {s.decor.map((d, k) => {
                const Icon = d.icon === 'heart' ? Heart : d.icon === 'star' ? Star : Sparkles;
                return (
                  <Icon
                    key={k}
                    size={d.s}
                    className="absolute text-pink-400 animate-pulse"
                    fill={d.icon === 'sparkle' ? 'none' : 'currentColor'}
                    style={{ left: d.x, top: d.y, animationDelay: `${d.d}s`, filter: 'drop-shadow(0 0 6px rgba(236,72,153,0.9))' }}
                  />
                );
              })}
            </div>

            {/* texto */}
            <div
              className={`absolute inset-y-0 z-10 flex flex-col justify-center px-6 ${
                align === 'center' ? 'left-0 right-0 items-center text-center' : 'right-0 left-0 items-center text-center sm:items-start sm:text-left'
              }`}

            >
              <div
                className={align === 'center' ? 'max-w-[460px] px-4 py-3 rounded-2xl' : 'max-w-[520px]'}
                // 'after': texto a 42px da personagem (a coluna já tem 24px de margem)
                style={
                  align === 'center'
                    ? { background: 'radial-gradient(closest-side, rgba(11,7,16,0.72), rgba(11,7,16,0) )' }
                    : { marginLeft: smUp ? s.chars[0].offset + Math.round(s.chars[0].height * s.chars[0].aspect) + 42 - 24 : 0 }
                }
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-pink-300/90">{s.eyebrow}</span>
                <h2 className="mt-1.5 text-[25px] leading-tight font-extrabold text-white" style={{ textShadow: '0 0 18px rgba(236,72,153,0.5), 0 2px 8px rgba(0,0,0,0.6)' }}>
                  {s.title}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/80" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}>
                  {s.subtitle}
                </p>
                {s.note && <p className="mt-1 text-[11.5px] text-pink-200/85">{s.note}</p>}
                {s.cta && (
                  <div className="mt-3.5">
                    <button
                      type="button"
                      onClick={s.cta.onClick}
                      tabIndex={active ? 0 : -1}
                      className={`h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer transition-transform hover:scale-[1.03] ${
                        s.cta.primary ? 'text-white shadow-[0_0_24px_rgba(236,72,153,0.55)]' : 'text-white border border-white/20 bg-white/10 hover:bg-white/15 backdrop-blur-sm'
                      }`}
                      style={s.cta.primary ? { background: 'linear-gradient(90deg, #ec4899, #f43f5e)' } : undefined}
                    >
                      {s.cta.icon}
                      {s.cta.label}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* setas */}
      <button
        type="button"
        onClick={() => go(index - 1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/45 border border-white/15 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        aria-label={t('Anterior')}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-black/45 border border-white/15 text-white/80 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
        aria-label={t('Próxima')}
      >
        <ChevronRight size={16} />
      </button>

      {/* pontos (centralizados) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1} / ${slides.length}`}
            aria-current={i === index}
            className="h-1.5 rounded-full transition-all cursor-pointer"
            style={{ width: i === index ? 22 : 8, background: i === index ? '#ec4899' : 'rgba(255,255,255,0.3)' }}
          />
        ))}
      </div>
    </section>
  );
};
