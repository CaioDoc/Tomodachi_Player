import type { Parts } from '../types';

// "Esta fonte funciona?": teste do site, da busca, dos episódios e do vídeo
const parts: Parts = {
  Testar: ['Test', 'Probar'],
  'Abre o site, busca uma obra e tenta tocar um vídeo — para saber se dá para assistir por esta fonte': [
    'Opens the site, searches for a title and tries to play a video — to find out whether you can watch from this source',
    'Abre el sitio, busca una obra e intenta reproducir un video, para saber si puedes ver desde esta fuente',
  ],
  'abrindo o site…': ['opening the site…', 'abriendo el sitio…'],
  'testando a busca…': ['testing the search…', 'probando la búsqueda…'],
  'lendo os episódios…': ['reading the episodes…', 'leyendo los episodios…'],
  'procurando o vídeo…': ['looking for the video…', 'buscando el video…'],
  'testado com': ['tested with', 'probado con'],
  '{name}: funciona': ['{name}: works', '{name}: funciona'],
  funciona: ['works', 'funciona'],
  'não respondeu': ["didn't answer", 'no respondió'],
  'vídeo não abriu': ["video didn't open", 'el video no abrió'],
  'sem episódios': ['no episodes', 'sin episodios'],
  'só navegando': ['browsing only', 'solo navegando'],
  'O site não abriu nem pelo navegador do app.': ["The site didn't open, not even in the app's browser.", 'El sitio no abrió ni en el navegador de la app.'],
  'Busca, episódios e vídeo: tudo certo por aqui.': ['Search, episodes and video: all good here.', 'Búsqueda, episodios y video: todo bien por aquí.'],
  'O app lista os episódios, mas não conseguiu pegar o vídeo desta obra. Pode ser só esta obra: teste outra pelo Navegar.': [
    "The app lists the episodes but couldn't get the video for this title. It may be just this one: try another through Browse.",
    'La app lista los episodios pero no logró obtener el video de esta obra. Puede ser solo esta: prueba otra con Navegar.',
  ],
  'A busca funciona, mas o app não achou a lista de episódios.': [
    "Search works, but the app didn't find the episode list.",
    'La búsqueda funciona, pero la app no encontró la lista de episodios.',
  ],
  'O site abre, mas a busca do app não traz resultados. Use o Navegar para achar a obra e "Assistir no app".': [
    'The site opens, but the app’s search returns nothing. Use Browse to find the title and "Watch in the app".',
    'El sitio abre, pero la búsqueda de la app no trae resultados. Usa Navegar para encontrar la obra y "Ver en la app".',
  ],
  'A busca do site não trouxe resultados pelo app': ["The site's search returned nothing through the app", 'La búsqueda del sitio no trajo resultados por la app'],
  'O site não mostrou nenhuma obra na página inicial': ["The site didn't show any title on its home page", 'El sitio no mostró ninguna obra en la página de inicio'],
  'Não achei a lista de episódios desta obra': ["I couldn't find the episode list for this title", 'No encontré la lista de episodios de esta obra'],
};

export default parts;
