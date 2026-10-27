// src/components/ThemeEditorTab.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Palette, 
  Code, 
  Check, 
  Download, 
  Upload, 
  RotateCcw, 
  Copy, 
  Sparkles, 
  Info,
  CheckCircle2,
  FileCode,
  FileText
} from 'lucide-react';
import { 
  PRESET_THEMES, 
  getActiveTheme, 
  setActiveTheme, 
  serializeThemeToCss, 
  serializeThemeToJson,
  parsePlaintextToTheme, 
  applyTheme, 
  exportThemeToFile, 
  importThemeFromFile,
  type ThemeDefinition 
} from '../theme/themeEngine';
import { t } from '../i18n';

export const ThemeEditorTab: React.FC = () => {
  const [activeTheme, setActiveThemeState] = useState<ThemeDefinition>(getActiveTheme);
  const [code, setCode] = useState<string>(() => serializeThemeToCss(activeTheme));
  const [editorFormat, setEditorFormat] = useState<'css' | 'json'>('css');
  const [feedbackNotice, setFeedbackNotice] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza com eventos globais de tema
  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail) {
        setActiveThemeState(e.detail);
      }
    };
    window.addEventListener('tomodachi:theme-changed', handleThemeChange);
    return () => window.removeEventListener('tomodachi:theme-changed', handleThemeChange);
  }, []);

  const showFeedback = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackNotice({ message, type });
    setTimeout(() => {
      setFeedbackNotice(null);
    }, 3500);
  };

  // Seleciona um preset e atualiza o código
  const handleSelectPreset = (preset: ThemeDefinition) => {
    setActiveTheme(preset);
    setActiveThemeState(preset);
    const newCode = editorFormat === 'css' ? serializeThemeToCss(preset) : serializeThemeToJson(preset);
    setCode(newCode);
    showFeedback(t('Tema "{name}" aplicado com sucesso!', { name: t(preset.name) }));
  };

  // Alterna o formato do editor (CSS <-> JSON)
  const handleToggleFormat = (format: 'css' | 'json') => {
    setEditorFormat(format);
    if (format === 'css') {
      setCode(serializeThemeToCss(activeTheme));
    } else {
      setCode(serializeThemeToJson(activeTheme));
    }
  };

  // Aplica o código digitado em tempo real
  const handleLiveApply = () => {
    try {
      const parsed = parsePlaintextToTheme(code, activeTheme);
      applyTheme(parsed);
      setActiveThemeState(parsed);
      showFeedback(t('Tema aplicado ao vivo na interface!'), 'info');
    } catch (err: any) {
      showFeedback(t('Erro ao interpretar código: {error}', { error: String(err?.message || err) }), 'error');
    }
  };

  // Salva o tema customizado permanentemente
  const handleSaveTheme = () => {
    try {
      const parsed = parsePlaintextToTheme(code, activeTheme);
      setActiveTheme(parsed);
      setActiveThemeState(parsed);
      showFeedback(t('Tema customizado salvo com sucesso!'), 'success');
    } catch (err: any) {
      showFeedback(t('Falha ao salvar tema: {error}', { error: String(err?.message || err) }), 'error');
    }
  };

  // Copia o código do editor para o clipboard
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showFeedback(t('Código copiado para a área de transferência!'), 'success');
    } catch {
      showFeedback(t('Não foi possível copiar o código.'), 'error');
    }
  };

  // Exporta o tema para arquivo
  const handleExport = (format: 'css' | 'json') => {
    try {
      const parsed = parsePlaintextToTheme(code, activeTheme);
      exportThemeToFile(parsed, format);
      showFeedback(t('Arquivo do tema .{format} baixado!', { format }), 'success');
    } catch (err: any) {
      showFeedback(t('Falha ao exportar tema: {error}', { error: String(err?.message || err) }), 'error');
    }
  };

  // Importa arquivo local
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const importedTheme = await importThemeFromFile(file, activeTheme);
      setActiveTheme(importedTheme);
      setActiveThemeState(importedTheme);
      setCode(editorFormat === 'css' ? serializeThemeToCss(importedTheme) : serializeThemeToJson(importedTheme));
      showFeedback(t('Tema "{name}" importado e ativado!', { name: t(importedTheme.name) }), 'success');
    } catch (err: any) {
      showFeedback(t('Erro ao importar arquivo: {error}', { error: String(err?.message || err) }), 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Restaura o tema padrão
  const handleResetDefault = () => {
    const defaultTheme = PRESET_THEMES[0];
    setActiveTheme(defaultTheme);
    setActiveThemeState(defaultTheme);
    setCode(editorFormat === 'css' ? serializeThemeToCss(defaultTheme) : serializeThemeToJson(defaultTheme));
    showFeedback(t('Tema padrão restaurado com sucesso!'), 'info');
  };

  return (
    <div className="flex flex-col gap-6 text-fg-2 select-none">
      {/* Feedback Alert Notice */}
      {feedbackNotice && (
        <div 
          role="status"
          aria-live="polite"
          className={`p-3 rounded-md text-xs flex items-center justify-between border transition-all ${
            feedbackNotice.type === 'success'
              ? 'bg-[#1b2f21] border-success-hover/50 text-success-fg'
              : feedbackNotice.type === 'error'
              ? 'bg-[#3c1e22] border-danger-fg/50 text-danger-fg'
              : 'bg-[#1c2738] border-accent-hover/50 text-accent-hover'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span className="font-medium">{feedbackNotice.message}</span>
          </div>
        </div>
      )}

      {/* 1. Presets Grid */}
      <section aria-labelledby="presets-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-fg" aria-hidden="true" />
            <h2 id="presets-heading" className="text-sm font-semibold text-fg">
              {t('Temas Predefinidos')}
            </h2>
          </div>
          <span className="text-xs text-fg-muted">
            {t('Clique em qualquer tema para aplicar instantaneamente')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {PRESET_THEMES.map((preset) => {
            const isSelected = activeTheme.id === preset.id;
            const vars = preset.variables;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer relative flex flex-col justify-between gap-3 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none ${
                  isSelected
                    ? 'bg-surface border-fg/80 shadow-md ring-1 ring-fg/30'
                    : 'bg-surface border-line hover:border-fg-muted hover:bg-subtle/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-fg">
                      {t(preset.name)}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-fg bg-subtle px-2 py-0.5 rounded-full border border-line">
                        <Check size={11} /> {t('Ativo')}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-fg-muted mt-1 line-clamp-2 leading-relaxed">
                    {t(preset.description)}
                  </p>
                </div>

                {/* Color Palette Preview Swatches */}
                <div className="flex items-center gap-1.5 pt-1">
                  <span 
                    className="w-5 h-5 rounded-md border border-line shadow-xs" 
                    style={{ backgroundColor: vars['--bg-canvas'] }} 
                    title="Canvas"
                  />
                  <span 
                    className="w-5 h-5 rounded-md border border-line shadow-xs" 
                    style={{ backgroundColor: vars['--bg-surface'] }} 
                    title="Surface"
                  />
                  <span 
                    className="w-5 h-5 rounded-md border border-line shadow-xs" 
                    style={{ backgroundColor: vars['--bg-subtle'] }} 
                    title="Subtle"
                  />
                  <span 
                    className="w-5 h-5 rounded-md border border-line shadow-xs" 
                    style={{ backgroundColor: vars['--accent'] }} 
                    title="Accent"
                  />
                  <span 
                    className="w-5 h-5 rounded-md border border-line shadow-xs flex items-center justify-center text-[9px] font-bold" 
                    style={{ backgroundColor: vars['--bg-card'], color: vars['--text-primary'] }} 
                    title="Text / Card"
                  >
                    Aa
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Plaintext Code Editor Section */}
      <section aria-labelledby="editor-heading" className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Code size={16} className="text-fg" aria-hidden="true" />
            <h2 id="editor-heading" className="text-sm font-semibold text-fg">
              {t('Editor de Código do Tema (Plaintext)')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Format toggle: CSS or JSON */}
            <div className="flex items-center bg-canvas p-0.5 rounded-md border border-line text-xs">
              <button
                type="button"
                onClick={() => handleToggleFormat('css')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  editorFormat === 'css' 
                    ? 'bg-subtle text-fg font-semibold' 
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                CSS (:root)
              </button>
              <button
                type="button"
                onClick={() => handleToggleFormat('json')}
                className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  editorFormat === 'json' 
                    ? 'bg-subtle text-fg font-semibold' 
                    : 'text-fg-muted hover:text-fg'
                }`}
              >
                JSON
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="px-2.5 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg rounded-md border border-line text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Copiar código')}
            >
              <Copy size={12} />
              <span>{t('Copiar')}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-fg-muted">
          {t('Modifique as variáveis CSS livremente abaixo. Você pode ajustar cores, bordas, textos ou escrever seletores CSS adicionais para customizar a interface conforme desejar.')}
        </p>

        {/* Monospace Plaintext Codearea */}
        <div className="relative rounded-lg border border-line bg-canvas overflow-hidden focus-within:border-neutral-400 transition-colors">
          <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line text-[11px] text-fg-muted font-mono">
            <span>{editorFormat === 'css' ? 'theme.css' : 'theme.json'}</span>
            <span>UTF-8 • Plaintext</span>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            rows={14}
            className="w-full bg-canvas text-fg font-mono text-xs p-3.5 outline-none resize-y leading-relaxed selection:bg-[#264f78]"
            placeholder={editorFormat === 'css' ? ':root { --bg-canvas: #... }' : '{\n  "variables": {}\n}'}
          />
        </div>

        {/* Action Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Left Actions: Live Apply & Save */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLiveApply}
              className="px-3.5 py-2 bg-subtle hover:bg-elevated text-fg rounded-md border border-line text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:ring-1 focus-visible:ring-neutral-400"
              title={t('Aplica na interface em tempo real para visualizar')}
            >
              <Sparkles size={13} />
              <span>{t('Aplicar em Tempo Real')}</span>
            </button>

            <button
              type="button"
              onClick={handleSaveTheme}
              className="px-3.5 py-2 bg-success hover:bg-success-hover text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs focus-visible:ring-1 focus-visible:ring-neutral-400"
              title={t('Salva permanentemente no Tomodachi Player')}
            >
              <Check size={14} />
              <span>{t('Salvar Tema')}</span>
            </button>
          </div>

          {/* Right Actions: Import, Export, Reset */}
          <div className="flex items-center gap-2">
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".css,.json,text/css,application/json" 
              onChange={handleFileChange}
              className="hidden" 
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg rounded-md border border-line text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Importar tema de um arquivo local (.css ou .json)')}
            >
              <Upload size={12} />
              <span>{t('Importar Arquivo')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('css')}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg rounded-md border border-line text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Baixar arquivo CSS do tema')}
            >
              <Download size={12} />
              <span>{t('Exportar CSS')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg rounded-md border border-line text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Baixar arquivo JSON do tema')}
            >
              <FileCode size={12} />
              <span>{t('Exportar JSON')}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-muted hover:text-fg rounded-md border border-line text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Restaurar para o tema escuro padrão')}
            >
              <RotateCcw size={12} />
              <span>{t('Restaurar Padrão')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. Variables Reference Documentation */}
      <section className="p-4 bg-surface border border-line rounded-lg text-xs space-y-2.5">
        <div className="flex items-center gap-2 text-fg font-semibold">
          <Info size={14} className="text-fg-muted" />
          <span>{t('Referência de Variáveis Suportadas')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 font-mono text-[11px] pt-1">
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--bg-canvas</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Fundo base profundo de toda a aplicação.')}</p>
          </div>
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--bg-surface</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Barras superiores, janelas modais e painéis.')}</p>
          </div>
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--bg-subtle</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Fundo de abas ativas, botões secundários e hover.')}</p>
          </div>
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--border-color</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Linhas de contorno e divisores neutros.')}</p>
          </div>
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--text-primary</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Títulos e rótulos principais (alto contraste).')}</p>
          </div>
          <div className="p-2 bg-canvas rounded border border-line">
            <span className="text-fg font-semibold">--accent</span>
            <p className="text-fg-muted font-sans text-[11px] mt-0.5">{t('Cor primária para botões de ação e anéis de foco.')}</p>
          </div>
        </div>
      </section>
    </div>
  );
};
