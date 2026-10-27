// src/theme/themeEngine.ts
import { t } from '../i18n';

export interface ThemeVariables {
  '--bg-canvas': string;
  '--bg-surface': string;
  '--bg-subtle': string;
  '--bg-card': string;
  '--border-color': string;
  '--border-subtle': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--accent': string;
  '--accent-hover': string;
  '--accent-text': string;
  '--radius-base': string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  variables: ThemeVariables;
  customCss?: string;
  isCustom?: boolean;
}

export const PRESET_THEMES: ThemeDefinition[] = [
  {
    id: 'tomodachi-pink',
    name: t('Tomodachi Rosa (Padrão)'),
    description: t('As cores do ícone: rosa neon sobre roxo bem escuro.'),
    variables: {
      '--bg-canvas': '#0e0912',
      '--bg-surface': '#151019',
      '--bg-subtle': '#1f1725',
      '--bg-card': '#18111d',
      '--border-color': '#2e2236',
      '--border-subtle': '#22192a',
      '--text-primary': '#f7eef6',
      '--text-secondary': '#d8cad8',
      '--text-muted': '#9d8ca3',
      '--accent': '#f46ba8',
      '--accent-hover': '#ff8fc2',
      '--accent-text': '#1a0612',
      '--radius-base': '8px'
    }
  },
  {
    id: 'default-dark',
    name: t('Tomodachi Azul'),
    description: t('Interface escura moderna, balanceada e profissional no estilo Linear e GitHub Dark.'),
    variables: {
      '--bg-canvas': '#0b0e14',
      '--bg-surface': '#121620',
      '--bg-subtle': '#1a212e',
      '--bg-card': '#141b26',
      '--border-color': '#262d3d',
      '--border-subtle': '#1c2331',
      '--text-primary': '#f0f6fc',
      '--text-secondary': '#c3cbd5',
      '--text-muted': '#8590a0',
      '--accent': '#4c8dff',
      '--accent-hover': '#7aaaff',
      '--accent-text': '#ffffff',
      '--radius-base': '8px'
    }
  },
  {
    id: 'midnight-oled',
    name: 'Midnight OLED',
    description: t('Fundo preto puro (#000000) com contraste nítido, ideal para telas OLED e alta imersão.'),
    variables: {
      '--bg-canvas': '#000000',
      '--bg-surface': '#0d0d10',
      '--bg-subtle': '#16161a',
      '--bg-card': '#0f0f12',
      '--border-color': '#232328',
      '--border-subtle': '#1a1a1f',
      '--text-primary': '#ffffff',
      '--text-secondary': '#a1a1aa',
      '--text-muted': '#71717a',
      '--accent': '#38bdf8',
      '--accent-hover': '#7dd3fc',
      '--accent-text': '#000000',
      '--radius-base': '8px'
    }
  },
  {
    id: 'nord',
    name: 'Nord Frost',
    description: t('Paleta nórdica serena com tons azul-ártico e cinza suave.'),
    variables: {
      '--bg-canvas': '#242933',
      '--bg-surface': '#2e3440',
      '--bg-subtle': '#3b4252',
      '--bg-card': '#2e3440',
      '--border-color': '#434c5e',
      '--border-subtle': '#3b4252',
      '--text-primary': '#eceff4',
      '--text-secondary': '#d8dee9',
      '--text-muted': '#7b88a1',
      '--accent': '#88c0d0',
      '--accent-hover': '#81a1c1',
      '--accent-text': '#242933',
      '--radius-base': '8px'
    }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    description: t('Paleta pastel escura confortável para os olhos com acentos lavanda/mauve.'),
    variables: {
      '--bg-canvas': '#11111b',
      '--bg-surface': '#181825',
      '--bg-subtle': '#1e1e2e',
      '--bg-card': '#181825',
      '--border-color': '#313244',
      '--border-subtle': '#252636',
      '--text-primary': '#cdd6f4',
      '--text-secondary': '#a6adc8',
      '--text-muted': '#6c7086',
      '--accent': '#cba6f7',
      '--accent-hover': '#b4befe',
      '--accent-text': '#11111b',
      '--radius-base': '8px'
    }
  },
  {
    id: 'dracula',
    name: 'Dracula Modern',
    description: t('O clássico tema gótico escuro com carvão aveludado e acento violeta elegante.'),
    variables: {
      '--bg-canvas': '#1e1f29',
      '--bg-surface': '#282a36',
      '--bg-subtle': '#343746',
      '--bg-card': '#282a36',
      '--border-color': '#44475a',
      '--border-subtle': '#353847',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#cfd2e3',
      '--text-muted': '#6272a4',
      '--accent': '#bd93f9',
      '--accent-hover': '#ff79c6',
      '--accent-text': '#282a36',
      '--radius-base': '8px'
    }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    description: t('Inspirado nas luzes noturnas de Tóquio com azul-marinho profundo e ciano sutil.'),
    variables: {
      '--bg-canvas': '#16161e',
      '--bg-surface': '#1a1b26',
      '--bg-subtle': '#24283b',
      '--bg-card': '#1a1b26',
      '--border-color': '#292e42',
      '--border-subtle': '#202336',
      '--text-primary': '#c0caf5',
      '--text-secondary': '#9aa5ce',
      '--text-muted': '#737aa2',
      '--accent': '#7aa2f7',
      '--accent-hover': '#7dcfff',
      '--accent-text': '#16161e',
      '--radius-base': '8px'
    }
  }
];

const THEME_STORAGE_KEY = 'tomodachi_active_theme';
const PINK_MIGRATION_KEY = 'tomodachi_theme_pink_migrated';
const CUSTOM_THEME_STORAGE_KEY = 'tomodachi_custom_theme_code';

/**
 * Converte um ThemeDefinition para formato CSS texto (plaintext) legível com comentários.
 */
export function serializeThemeToCss(theme: ThemeDefinition): string {
  const vars = theme.variables;
  return `/* ========================================================
   Tema: ${theme.name}
   ${theme.description || 'Tema customizado para Tomodachi Player'}
   ======================================================== */

:root {
  /* Cores de Fundo / Superfície */
  --bg-canvas: ${vars['--bg-canvas']};         /* Fundo principal da aplicação */
  --bg-surface: ${vars['--bg-surface']};       /* Painéis, barras superiores e menus */
  --bg-subtle: ${vars['--bg-subtle']};         /* Elementos secundários, hover e abas */
  --bg-card: ${vars['--bg-card']};             /* Superfície dos cartões de obras */

  /* Bordas Neutras (Sem poluição visual) */
  --border-color: ${vars['--border-color']};   /* Borda neutra principal */
  --border-subtle: ${vars['--border-subtle']}; /* Borda neutra sutil */

  /* Tipografia & Acessibilidade */
  --text-primary: ${vars['--text-primary']};   /* Texto principal de alto contraste */
  --text-secondary: ${vars['--text-secondary']}; /* Texto secundário legível */
  --text-muted: ${vars['--text-muted']};       /* Metadados e legendas */

  /* Destaque (Ações primárias) */
  --accent: ${vars['--accent']};               /* Cor de botões e destaques */
  --accent-hover: ${vars['--accent-hover']};   /* Hover do destaque */
  --accent-text: ${vars['--accent-text']};     /* Texto sobre o destaque */

  /* Geometria */
  --radius-base: ${vars['--radius-base'] || '8px'};
}

${theme.customCss || '/* Escreva regras CSS adicionais abaixo, se desejar */'}
`.trim();
}

/**
 * Converte um ThemeDefinition para JSON plaintext formatado.
 */
export function serializeThemeToJson(theme: ThemeDefinition): string {
  return JSON.stringify(theme, null, 2);
}

/**
 * Faz o parse seguro de texto CSS digitado pelo usuário para um ThemeDefinition.
 */
export function parseCssToTheme(cssText: string, currentTheme?: ThemeDefinition): ThemeDefinition {
  const baseTheme = currentTheme || PRESET_THEMES[0];
  const vars: ThemeVariables = { ...baseTheme.variables };

  // Extrai nome do tema nos comentários se existir
  let name = t('Tema Customizado');
  const nameMatch = cssText.match(/Tema:\s*([^\r\n*]+)/i);
  if (nameMatch && nameMatch[1].trim()) {
    name = nameMatch[1].trim();
  }

  // Regex para capturar declarações de variáveis CSS: --nome-var: valor;
  const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;!}\r\n]+)/g;
  let match;
  while ((match = varRegex.exec(cssText)) !== null) {
    const key = match[1].trim() as keyof ThemeVariables;
    const value = match[2].trim();
    if (key in vars) {
      vars[key] = value;
    }
  }

  // Extrai CSS adicional fora do bloco :root primário
  let customCss = '';
  const rootBlockRegex = /:root\s*\{[\s\S]*?\}/;
  const stripped = cssText.replace(rootBlockRegex, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (stripped.length > 0) {
    customCss = stripped;
  }

  return {
    id: 'custom-' + Date.now(),
    name,
    description: t('Tema codado manualmente pelo usuário em plaintext.'),
    variables: vars,
    customCss,
    isCustom: true
  };
}

/**
 * Faz o parse de arquivo/texto JSON ou CSS.
 */
export function parsePlaintextToTheme(code: string, currentTheme?: ThemeDefinition): ThemeDefinition {
  const trimmed = code.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.variables) {
        return {
          id: parsed.id || 'custom-' + Date.now(),
          name: parsed.name || t('Tema Importado'),
          description: parsed.description || t('Tema importado via JSON.'),
          variables: { ...(currentTheme?.variables || PRESET_THEMES[0].variables), ...parsed.variables },
          customCss: parsed.customCss || '',
          isCustom: true
        };
      }
    } catch {
      // Falha no JSON, tenta via CSS
    }
  }
  return parseCssToTheme(trimmed, currentTheme);
}

/**
 * Converte qualquer cor CSS válida para canais RGB ("r g b").
 * Usa o próprio navegador para resolver nomes, hsl(), rgb() etc.
 */
const channelCache = new Map<string, string>();
export function colorToChannels(value: string, fallback = '0 0 0'): string {
  const raw = (value || '').trim();
  if (!raw) return fallback;
  const cached = channelCache.get(raw);
  if (cached) return cached;

  let result: string | null = null;
  const hex = raw.startsWith('#') ? raw.slice(1) : '';
  if (/^[0-9a-fA-F]{3,4}$/.test(hex) || /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    const full = hex.length <= 4 ? hex.slice(0, 3).split('').map((c) => c + c).join('') : hex.slice(0, 6);
    const n = parseInt(full, 16);
    result = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  } else if (typeof document !== 'undefined' && document.body) {
    const probe = document.createElement('span');
    probe.style.color = raw;
    if (probe.style.color) {
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      const m = computed.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/);
      if (m) result = `${Math.round(+m[1])} ${Math.round(+m[2])} ${Math.round(+m[3])}`;
    }
  }

  const final = result || fallback;
  channelCache.set(raw, final);
  return final;
}

/** Mapeamento: variável do tema -> variável de canal usada pelo Tailwind */
const CHANNEL_MAP: Array<[keyof ThemeVariables, string, string]> = [
  ['--bg-canvas', '--c-canvas', '11 14 20'],
  ['--bg-surface', '--c-surface', '18 22 32'],
  ['--bg-subtle', '--c-subtle', '26 33 46'],
  ['--bg-card', '--c-card', '20 27 38'],
  ['--border-color', '--c-border', '38 45 61'],
  ['--border-subtle', '--c-border-subtle', '28 35 49'],
  ['--text-primary', '--c-text', '240 246 252'],
  ['--text-secondary', '--c-text-2', '195 203 213'],
  ['--text-muted', '--c-text-muted', '133 144 160'],
  ['--accent', '--c-accent', '76 141 255'],
  ['--accent-hover', '--c-accent-hover', '122 170 255'],
  ['--accent-text', '--c-accent-text', '255 255 255'],
];

/**
 * Injeta dinamicamente as variáveis do tema no DOM.
 */
export function applyTheme(theme: ThemeDefinition): void {
  let styleEl = document.getElementById('tomodachi-theme-root') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'tomodachi-theme-root';
    document.head.appendChild(styleEl);
  }

  const vars = { ...PRESET_THEMES[0].variables, ...(theme.variables || {}) } as ThemeVariables;

  const lines: string[] = [];
  for (const [k, val] of Object.entries(vars)) {
    if (typeof val === 'string' && val.trim()) lines.push(`  ${k}: ${val};`);
  }
  for (const [themeVar, channelVar, fallback] of CHANNEL_MAP) {
    lines.push(`  ${channelVar}: ${colorToChannels(vars[themeVar], fallback)};`);
  }
  // Superfície "elevada" (hover de botões, trilhas de slider) = cor da borda principal
  lines.push(`  --c-elevated: ${colorToChannels(vars['--border-color'], '38 45 61')};`);

  styleEl.textContent = `:root {\n${lines.join('\n')}\n}\n\n/* CSS adicional definido pelo usuário */\n${theme.customCss || ''}\n`;

  document.body?.setAttribute('data-theme', theme.id);

  // Sincroniza a cor dos botões nativos da janela (minimizar/maximizar/fechar)
  try {
    window.electronAPI?.setTitleBarOverlay?.({
      color: vars['--bg-canvas'],
      symbolColor: vars['--text-secondary'],
    });
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent('tomodachi:theme-changed', { detail: theme }));
}

/**
 * Obtém o tema ativo armazenado ou o padrão.
 */
export function getActiveTheme(): ThemeDefinition {
  try {
    // v1.2: o tema rosa (cores do ícone) vira o padrão; quem estava no antigo padrão azul migra uma única vez
    if (!localStorage.getItem(PINK_MIGRATION_KEY)) {
      localStorage.setItem(PINK_MIGRATION_KEY, '1');
      const prev = localStorage.getItem(THEME_STORAGE_KEY);
      try {
        if (prev && JSON.parse(prev)?.id === 'default-dark') localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.variables) {
        // Temas predefinidos sempre usam a definição mais recente do app
        const preset = !parsed.isCustom ? PRESET_THEMES.find((p) => p.id === parsed.id) : undefined;
        return preset || parsed;
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar tema armazenado:', e);
  }
  return PRESET_THEMES[0];
}

/**
 * Salva e aplica o tema ativo.
 */
export function setActiveTheme(theme: ThemeDefinition): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch (e) {
    console.warn('Erro ao persistir tema:', e);
  }
  applyTheme(theme);
}

/**
 * Exporta o tema para download de arquivo `.css` ou `.json`.
 */
export function exportThemeToFile(theme: ThemeDefinition, format: 'css' | 'json' = 'css'): void {
  const content = format === 'css' ? serializeThemeToCss(theme) : serializeThemeToJson(theme);
  const mime = format === 'css' ? 'text/css' : 'application/json';
  const fileName = `${theme.name.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'tomodachi_theme'}.${format}`;

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Lê um arquivo local importado pelo usuário.
 */
export function importThemeFromFile(file: File, currentTheme?: ThemeDefinition): Promise<ThemeDefinition> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const theme = parsePlaintextToTheme(text, currentTheme);
        resolve(theme);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error(t('Falha ao ler o arquivo selecionado.')));
    reader.readAsText(file);
  });
}

/**
 * Inicialização global do tema ao carregar a aplicação.
 */
export function initTheme(): ThemeDefinition {
  const theme = getActiveTheme();
  applyTheme(theme);
  return theme;
}
