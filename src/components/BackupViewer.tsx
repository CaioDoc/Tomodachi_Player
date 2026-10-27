import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Upload, 
  BookOpen, 
  Film, 
  Folder, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  FileArchive,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { parseTachiyomiBackup } from '../api/backupParser';
import type { TachiyomiBackupResult, BackupManga, BackupAnime, TabType } from '../types';
import { t, tMaybe } from '../i18n';

interface BackupViewerProps {
  initialFilePath?: string;
  onOpenTab: (type: TabType, title: string, data?: any) => void;
}

export const BackupViewer: React.FC<BackupViewerProps> = ({
  initialFilePath,
  onOpenTab
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [backupData, setBackupData] = useState<TachiyomiBackupResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [activeType, setActiveType] = useState<'manga' | 'anime'>('manga');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<BackupManga | BackupAnime | null>(null);

  const loadBackupFile = async (filePath: string) => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.readFileBuffer(filePath);
      if (!res.success || !res.data) {
        throw new Error(tMaybe(res.error) || t('Falha ao ler arquivo do disco'));
      }

      const parsed = await parseTachiyomiBackup(res.data);
      setBackupData(parsed);
      setFileName(filePath.split(/[\\/]/).pop() || 'backup.tachibk');
    } catch (err: any) {
      setError(tMaybe(err.message) || t('Falha ao processar arquivo .tachibk'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFilePath) {
      loadBackupFile(initialFilePath);
    }
  }, [initialFilePath]);

  const handlePickFile = async () => {
    if (!window.electronAPI) return;
    const selected = await window.electronAPI.openFileDialog({
      title: t('Selecionar Backup Mihon/Aniyomi (.tachibk)'),
      filters: [
        { name: t('Backup do Tachiyomi/Aniyomi (*.tachibk)'), extensions: ['tachibk', 'proto.gz', 'proto'] },
        { name: t('Todos os Arquivos'), extensions: ['*'] }
      ]
    });

    if (selected) {
      loadBackupFile(selected);
    }
  };

  const mangaList = backupData?.backupManga || [];
  const animeList = backupData?.backupAnime || [];
  const currentList = activeType === 'manga' ? mangaList : animeList;

  // Filter list by category and search
  const filteredList = currentList.filter((item) => {
    const titleMatch = item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    const authorMatch = item.author?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false;
    const matchesSearch = !searchQuery || titleMatch || authorMatch;

    if (!matchesSearch) return false;
    if (selectedCategory === 'all') return true;

    // Check category match if categories are present
    const itemCategories = item.categories || [];
    return itemCategories.includes(Number(selectedCategory));
  });

  const categories = activeType === 'manga' 
    ? (backupData?.backupCategories || []) 
    : (backupData?.backupAnimeCategories || []);

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden">
      {/* Top Header */}
      <div className="p-2.5 bg-surface border-b border-line flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-cyan-950/60 border border-cyan-800/80 text-cyan-400">
            <Database size={16} />
          </div>
          <div>
            <span className="font-semibold text-fg text-sm">{t('Decodificador Mihon / Aniyomi')}</span>
            {fileName && (
              <span className="ml-2 text-[11px] font-mono text-fg-muted">
                ({fileName})
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handlePickFile}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-fg rounded border border-line transition-colors"
        >
          <Upload size={14} className="text-cyan-400" />
          <span className="font-medium">{t('Carregar .tachibk')}</span>
        </button>
      </div>

      {/* Main Container */}
      {!backupData ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-fg-muted">
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={36} className="animate-spin text-cyan-400" />
              <p className="text-sm">{t('Descompactando Gzip e decodificando Protobuf...')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center mb-4 text-cyan-400">
                <FileArchive size={32} />
              </div>
              <h3 className="text-base font-semibold text-fg mb-1">
                {t('Nenhum backup carregado')}
              </h3>
              <p className="text-xs mb-4">
                {t('Selecione o arquivo de backup')} <span className="font-mono text-cyan-300">.tachibk</span>{' '}
                {t('do seu smartphone gerado pelo Mihon, Tachiyomi ou Aniyomi para visualizar sua biblioteca completa.')}
              </p>

              <button
                type="button"
                onClick={handlePickFile}
                className="px-4 py-2 bg-subtle hover:bg-elevated text-fg rounded-md border border-line text-xs font-semibold flex items-center gap-2 shadow transition-colors"
              >
                <Upload size={16} className="text-cyan-400" />
                <span>{t('Escolher Arquivo .tachibk')}</span>
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-950/40 border border-red-800 rounded-md text-red-300 text-xs flex items-center gap-2 text-left">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub Navigation Bar (Manga / Anime tabs + Categories + Search) */}
          <div className="px-3 py-2 bg-surface/70 border-b border-line flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="flex bg-canvas p-0.5 rounded border border-line">
                <button
                  type="button"
                  onClick={() => {
                    setActiveType('manga');
                    setSelectedCategory('all');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors ${
                    activeType === 'manga'
                      ? 'bg-subtle text-emerald-400 font-medium'
                      : 'text-fg-muted hover:text-white'
                  }`}
                >
                  <BookOpen size={14} />
                  <span>{t('Mangás ({n})', { n: mangaList.length })}</span>
                </button>

                {animeList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveType('anime');
                      setSelectedCategory('all');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-colors ${
                      activeType === 'anime'
                        ? 'bg-subtle text-purple-400 font-medium'
                        : 'text-fg-muted hover:text-white'
                    }`}
                  >
                    <Film size={14} />
                    <span>{t('Animes ({n})', { n: animeList.length })}</span>
                  </button>
                )}
              </div>

              {/* Categories Pills */}
              <div className="flex items-center gap-1 overflow-x-auto max-w-md scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-subtle text-accent border border-line'
                      : 'text-fg-muted hover:text-white'
                  }`}
                >
                  {t('Todas')}
                </button>
                {categories.map((cat, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCategory(String(cat.order ?? idx))}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                      selectedCategory === String(cat.order ?? idx)
                        ? 'bg-subtle text-accent border border-line'
                        : 'text-fg-muted hover:text-white'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Search filter input */}
            <div className="relative w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Filtrar por título...')}
                className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-8 pr-3 py-1 text-xs text-fg outline-none"
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            </div>
          </div>

          {/* Grid of Manga/Anime in Backup */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredList.length === 0 ? (
              <div className="text-center py-12 text-fg-muted text-xs">
                {t('Nenhum título encontrado nesta categoria ou pesquisa.')}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {filteredList.map((item, idx) => {
                  const title = item.title || t('Sem título');
                  const chaptersCount = 'chapters' in item ? (item.chapters?.length || 0) : ('episodes' in item ? (item.episodes?.length || 0) : 0);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedItem(item)}
                      className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md overflow-hidden cursor-pointer transition-all shadow-sm"
                    >
                      <div className="w-full h-44 bg-canvas overflow-hidden relative">
                        {item.thumbnailUrl ? (
                          <img
                            src={item.thumbnailUrl}
                            alt={title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-fg-muted">
                            {activeType === 'manga' ? <BookOpen size={32} /> : <Film size={32} />}
                          </div>
                        )}

                        <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                          {activeType === 'manga' ? t('{n} caps', { n: chaptersCount }) : t('{n} eps', { n: chaptersCount })}
                        </div>
                      </div>

                      <div className="p-2 flex flex-col justify-between flex-1">
                        <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight" title={title}>
                          {title}
                        </h4>
                        {item.author && (
                          <span className="text-[10px] text-fg-muted truncate mt-1">
                            {item.author}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Item Details Drawer/Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface border border-line rounded-lg max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas">
              <span className="font-semibold text-sm text-fg truncate">
                {selectedItem.title}
              </span>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="text-fg-muted hover:text-white text-base px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3 text-xs">
              <div className="flex gap-4">
                {selectedItem.thumbnailUrl && (
                  <img
                    src={selectedItem.thumbnailUrl}
                    alt={selectedItem.title}
                    referrerPolicy="no-referrer"
                    className="w-32 h-44 object-cover rounded-md border border-line"
                  />
                )}
                <div className="flex-1 flex flex-col gap-1.5">
                  <h3 className="font-bold text-sm text-fg">{selectedItem.title}</h3>
                  {selectedItem.author && (
                    <p className="text-fg-muted">{t('Autor: {name}', { name: selectedItem.author })}</p>
                  )}
                  {selectedItem.artist && (
                    <p className="text-fg-muted">{t('Artista: {name}', { name: selectedItem.artist })}</p>
                  )}
                  <p className="text-fg-muted font-mono text-[11px]">
                    {t('ID da fonte: {id}', { id: String(selectedItem.source) })}
                  </p>
                  <p className="text-fg-muted font-mono text-[11px] truncate">
                    URL: {selectedItem.url}
                  </p>
                  {selectedItem.url && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenTab('webview', selectedItem.title || 'Web', {
                          initialUrl: selectedItem.url.startsWith('http') ? selectedItem.url : `https://${selectedItem.url}`
                        });
                        setSelectedItem(null);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-accent rounded border border-line w-fit font-medium transition-colors"
                    >
                      <ExternalLink size={13} />
                      <span>{t('Abrir no Navegador Web')}</span>
                    </button>
                  )}
                </div>
              </div>

              {selectedItem.genre && selectedItem.genre.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedItem.genre.map((g, idx) => (
                    <span key={idx} className="bg-subtle text-fg-2 px-2 py-0.5 rounded text-[10px] border border-line">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {selectedItem.description && (
                <div className="bg-canvas p-2.5 rounded border border-line text-fg-muted leading-relaxed max-h-40 overflow-y-auto">
                  {selectedItem.description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
