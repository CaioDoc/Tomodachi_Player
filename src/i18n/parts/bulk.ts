import type { Parts } from '../types';

// Abas móveis e favoritar várias obras de uma vez
const parts: Parts = {
  Desmarcar: ['Unmark', 'Desmarcar'],
  'Marcar para favoritar (dá para marcar várias)': ['Mark to favorite (you can mark several)', 'Marcar para favoritos (puedes marcar varias)'],
  'Obras marcadas': ['Marked titles', 'Obras marcadas'],
  '{n} obra marcada': ['{n} title marked', '{n} obra marcada'],
  '{n} obras marcadas': ['{n} titles marked', '{n} obras marcadas'],
  'Desmarcar tudo (Esc)': ['Unmark all (Esc)', 'Desmarcar todo (Esc)'],
  'Favoritar {n} obra': ['Favorite {n} title', 'Añadir {n} obra a favoritos'],
  'Favoritar {n} obras': ['Favorite {n} titles', 'Añadir {n} obras a favoritos'],
  '{n} obra favoritada': ['{n} title added to favorites', '{n} obra añadida a favoritos'],
  '{n} obras favoritadas': ['{n} titles added to favorites', '{n} obras añadidas a favoritos'],
  'Alguns detalhes não carregaram': ['Some details did not load', 'Algunos detalles no cargaron'],
  '{n} obra será salva só com o básico; os episódios aparecem ao abrir.': [
    '{n} title will be saved with basic info only; episodes show up when you open it.',
    '{n} obra se guardará solo con lo básico; los episodios aparecen al abrirla.',
  ],
  '{n} obras serão salvas só com o básico; os episódios aparecem ao abrir.': [
    '{n} titles will be saved with basic info only; episodes show up when you open them.',
    '{n} obras se guardarán solo con lo básico; los episodios aparecen al abrirlas.',
  ],
};

export default parts;
