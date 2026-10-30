import type { Parts } from '../types';

// Player mais rápido (hls.js, pré-carregamento) e escolha de sites no "Onde assistir"
const parts: Parts = {
  'Não foi possível reproduzir este vídeo.': ["Couldn't play this video.", 'No se pudo reproducir este video.'],
  'Abrindo a página do episódio…': ['Opening the episode page…', 'Abriendo la página del episodio…'],
  'Procurando o vídeo na página…': ['Looking for the video on the page…', 'Buscando el video en la página…'],
  'Apertando play nos players do site para achar o vídeo…': ["Pressing play on the site's players to find the video…", 'Pulsando play en los reproductores del sitio para encontrar el video…'],
  '{n} s · o vídeo vai tocar aqui mesmo, no player do app': ["{n} s · the video will play right here, in the app's player", '{n} s · el video se reproducirá aquí mismo, en el reproductor de la app'],
  'Demorando? Procurar em outras fontes': ['Taking long? Look in other sources', '¿Tarda? Buscar en otras fuentes'],
  'Escolher em quais sites buscar': ['Choose which sites to search', 'Elegir en qué sitios buscar'],
  '{n} de {total} sites': ['{n} of {total} sites', '{n} de {total} sitios'],
  'Escolher sites': ['Choose sites', 'Elegir sitios'],
  'Buscar nestes sites (fica salvo para os próximos episódios):': ['Search these sites (saved for the next episodes):', 'Buscar en estos sitios (se guarda para los próximos episodios):'],
  'Clique para não buscar neste site': ["Click to stop searching this site", 'Haz clic para no buscar en este sitio'],
  'Clique para buscar neste site': ['Click to search this site', 'Haz clic para buscar en este sitio'],
  'Todos os sites estão desligados. Ligue algum acima para buscar.': ['All sites are turned off. Turn one on above to search.', 'Todos los sitios están desactivados. Activa alguno arriba para buscar.'],
  'O site não respondeu': ["The site didn't respond", 'El sitio no respondió'],
  'O site demorou demais para responder': ['The site took too long to respond', 'El sitio tardó demasiado en responder'],
  'O vídeo achado na página não abriu no player.': ["The video found on the page didn't open in the player.", 'El video encontrado en la página no se abrió en el reproductor.'],
  'Procurar outro vídeo na página': ['Look for another video on the page', 'Buscar otro video en la página'],
  'Não buscar neste site (fica salvo; dá para religar em "Escolher sites")': ['Don\'t search this site (saved; turn it back on in "Choose sites")', 'No buscar en este sitio (se guarda; puedes reactivarlo en "Elegir sitios")'],
  'Não buscar em {site}': ["Don't search {site}", 'No buscar en {site}'],
  'Buscando em {n} de {total} sites': ['Searching {n} of {total} sites', 'Buscando en {n} de {total} sitios'],
  'Marque só os sites onde quer procurar. Menos sites = busca mais rápida. A escolha fica salva para os próximos episódios e obras.': [
    'Check only the sites you want to search. Fewer sites = faster search. Your choice is saved for the next episodes and titles.',
    'Marca solo los sitios donde quieres buscar. Menos sitios = búsqueda más rápida. La elección se guarda para los próximos episodios y obras.',
  ],
  'Marcar todos': ['Select all', 'Marcar todos'],
};

export default parts;
