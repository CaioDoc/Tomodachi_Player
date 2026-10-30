import type { Parts } from '../types';

// Liga/desliga por site no "Onde assistir" e botões do navegador para fontes de vídeo
const parts: Parts = {
  'Buscar em {site}': ['Search {site}', 'Buscar en {site}'],
  'Ligado: clique para não buscar neste site (fica salvo)': ["On: click to stop searching this site (it's saved)", 'Activado: haz clic para no buscar en este sitio (se guarda)'],
  'Desligado: clique para buscar neste site': ['Off: click to search this site', 'Desactivado: haz clic para buscar en este sitio'],
  'use o botão de cada site para ligar/desligar (fica salvo)': ["use each site's switch to turn it on/off (it's saved)", 'usa el interruptor de cada sitio para activarlo/desactivarlo (se guarda)'],
  'Ligar todos': ['Turn all on', 'Activar todos'],
  'Desligar todos': ['Turn all off', 'Desactivar todos'],
  'Todos os sites estão desligados. Ligue algum abaixo para buscar.': ['All sites are off. Turn one on below to search.', 'Todos los sitios están desactivados. Activa alguno abajo para buscar.'],
  desligado: ['off', 'desactivado'],
  'Toca o vídeo desta página no player do app': ["Plays this page's video in the app's player", 'Reproduce el video de esta página en el reproductor de la app'],
  'Assistir no app': ['Watch in the app', 'Ver en la app'],
  'Abre esta obra no app, com a lista de episódios': ['Opens this title in the app, with the episode list', 'Abre esta obra en la app, con la lista de episodios'],
  'Episódios no app': ['Episodes in the app', 'Episodios en la app'],
  'Abrir esta fonte para navegar': ['Open this source to browse', 'Abrir esta fuente para navegar'],
};

export default parts;
