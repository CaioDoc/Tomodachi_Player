/**
 * Tomodachi Player — Design tokens
 *
 * Todas as cores da interface vêm de variáveis CSS em formato de canais RGB
 * (ex.: --c-canvas: 11 14 20). Isso permite que os temas troquem a paleta
 * inteira em tempo real e que modificadores de opacidade (bg-surface/80)
 * continuem funcionando.
 */
const plugin = require('tailwindcss/plugin');

const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: v('--c-canvas'),
        surface: v('--c-surface'),
        subtle: v('--c-subtle'),
        elevated: v('--c-elevated'),
        card: v('--c-card'),
        line: { DEFAULT: v('--c-border'), subtle: v('--c-border-subtle') },
        fg: { DEFAULT: v('--c-text'), 2: v('--c-text-2'), muted: v('--c-text-muted') },
        accent: { DEFAULT: v('--c-accent'), hover: v('--c-accent-hover'), fg: v('--c-accent-text') },
        success: { DEFAULT: '#238636', hover: '#2ea043', fg: '#3fb950' },
        danger: { DEFAULT: '#da3633', fg: '#f85149' },
        warning: { DEFAULT: '#d29922', fg: '#e3b341' },
      },
      borderRadius: {
        xs: '3px',
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(0 0 0 / 0.25)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(var(--c-border) / 0.6)',
      },
      spacing: {
        0.2: '0.05rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'tp-fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'tp-zoom-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'tp-slide-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'tp-fade-in': 'tp-fade-in 150ms ease-out',
        'tp-zoom-in': 'tp-zoom-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1)',
        'tp-slide-up': 'tp-slide-up 180ms ease-out',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        // Utilitários usados no código que não existem no Tailwind v3
        '.scrollbar-none': { 'scrollbar-width': 'none', '&::-webkit-scrollbar': { display: 'none' } },
        '.no-scrollbar': { 'scrollbar-width': 'none', '&::-webkit-scrollbar': { display: 'none' } },
        '.scrollbar-thin': { 'scrollbar-width': 'thin' },
        '.bg-linear-to-t': { 'background-image': 'linear-gradient(to top, var(--tw-gradient-stops))' },
        '.bg-linear-to-b': { 'background-image': 'linear-gradient(to bottom, var(--tw-gradient-stops))' },
        '.bg-linear-to-r': { 'background-image': 'linear-gradient(to right, var(--tw-gradient-stops))' },
        '.bg-linear-to-l': { 'background-image': 'linear-gradient(to left, var(--tw-gradient-stops))' },
        '.animate-in': { animation: 'tp-fade-in 150ms ease-out' },
        '.zoom-in-95': { animation: 'tp-zoom-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1)' },
        '.slide-in-from-top-2': { animation: 'tp-slide-up 180ms ease-out' },
      });
    }),
  ],
};
