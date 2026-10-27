import type { Parts } from '../types';

// Painel de Fontes (extensões + plugins) e legendas online
const parts: Parts = {
  'Mesmo título': ['Same title', 'Mismo título'],
  Parecido: ['Similar', 'Parecido'],
  Talvez: ['Maybe', 'Quizás'],
  'Carregando episódios…': ['Loading episodes…', 'Cargando episodios…'],
  'O site não listou episódios. Você pode abrir a página da obra no player.': [
    'The site did not list episodes. You can open the title page in the player.',
    'El sitio no listó episodios. Puedes abrir la página de la obra en el reproductor.',
  ],
  'Assistir episódio {n}': ['Watch episode {n}', 'Ver episodio {n}'],
  'O episódio {n} não está neste site. Escolha outro abaixo.': ['Episode {n} is not on this site. Pick another one below.', 'El episodio {n} no está en este sitio. Elige otro abajo.'],
  'Nenhuma extensão de anime instalada. Instale em Animes & Vídeos → Explorar → Extensões.': [
    'No anime extension installed. Install one in Anime & Videos → Browse → Extensions.',
    'Ninguna extensión de anime instalada. Instala en Animes y videos → Explorar → Extensiones.',
  ],
  'Procurando “{title}” nas extensões de anime.': ['Looking for “{title}” in the anime extensions.', 'Buscando “{title}” en las extensiones de anime.'],
  'Procurando a obra no catálogo…': ['Looking for the title in the catalog…', 'Buscando la obra en el catálogo…'],
  'Não encontrei “{title}” no catálogo do Nuvio.': ['Could not find “{title}” in the Nuvio catalog.', 'No encontré “{title}” en el catálogo de Nuvio.'],
  'Obra no catálogo': ['Title in the catalog', 'Obra en el catálogo'],
  'Confira se é a obra certa.': ['Check that it is the right title.', 'Comprueba que sea la obra correcta.'],
  'Abrir a página da obra no Nuvio': ['Open the title page in Nuvio', 'Abrir la página de la obra en Nuvio'],
  Temporada: ['Season', 'Temporada'],
  'Episódio': ['Episode', 'Episodio'],
  'Episódio anterior': ['Previous episode', 'Episodio anterior'],
  'Plugins (Nuvio)': ['Plugins (Nuvio)', 'Plugins (Nuvio)'],
  'Só aparecem links que o player do Tomodachi consegue reproduzir.': ['Only links the Tomodachi player can play are shown.', 'Solo aparecen enlaces que el reproductor de Tomodachi puede reproducir.'],
  '{n} resultado': ['{n} result', '{n} resultado'],
  '{n} resultados': ['{n} results', '{n} resultados'],
  'Buscando em {names}…': ['Searching {names}…', 'Buscando en {names}…'],
  'Nenhum link compatível encontrado. Tente outro episódio, outras fontes ou atualize os repositórios.': [
    'No compatible link found. Try another episode, other sources or update the repositories.',
    'No se encontró ningún enlace compatible. Prueba otro episodio, otras fuentes o actualiza los repositorios.',
  ],
  '{n} fonte sem links compatíveis': ['{n} source without compatible links', '{n} fuente sin enlaces compatibles'],
  '{n} fontes sem links compatíveis': ['{n} sources without compatible links', '{n} fuentes sin enlaces compatibles'],
  'Não encontrei “{title}” no catálogo. Ajuste o título e tente de novo.': ['Could not find “{title}” in the catalog. Adjust the title and try again.', 'No encontré “{title}” en el catálogo. Ajusta el título e inténtalo de nuevo.'],
  'Essa legenda veio vazia ou num formato que não consegui ler. Tente outra.': ['That subtitle was empty or in a format I could not read. Try another one.', 'Ese subtítulo vino vacío o en un formato que no pude leer. Prueba otro.'],
  'Legendas online': ['Online subtitles', 'Subtítulos en línea'],
  'Título do filme ou série': ['Movie or series title', 'Título de la película o serie'],
  'Temp.': ['Season', 'Temp.'],
  'Ep.': ['Ep.', 'Ep.'],
  Buscar: ['Search', 'Buscar'],
  'Idioma:': ['Language:', 'Idioma:'],
  'Resultado para: {name}': ['Results for: {name}', 'Resultados para: {name}'],
  'Procurando legendas…': ['Looking for subtitles…', 'Buscando subtítulos…'],
  'Nenhuma legenda encontrada.': ['No subtitles found.', 'No se encontraron subtítulos.'],
  Usar: ['Use', 'Usar'],
  'Legendas do OpenSubtitles e dos addons de legenda instalados na aba Nuvio. Se a sincronia não bater, experimente outra opção.': [
    'Subtitles from OpenSubtitles and the subtitle addons installed in the Nuvio tab. If the timing is off, try another option.',
    'Subtítulos de OpenSubtitles y de los addons de subtítulos instalados en la pestaña Nuvio. Si no están sincronizados, prueba otra opción.',
  ],
  'Nenhuma neste idioma ({n} em outros idiomas).': ['None in this language ({n} in other languages).', 'Ninguno en este idioma ({n} en otros idiomas).'],
  'Procurar este episódio nas extensões e nos plugins do Nuvio': ['Look for this episode in the extensions and Nuvio plugins', 'Buscar este episodio en las extensiones y en los plugins de Nuvio'],
  'Procurar também nas extensões de anime': ['Also look in the anime extensions', 'Buscar también en las extensiones de anime'],
  'O player do Tomodachi não toca os formatos deste plugin': ['The Tomodachi player cannot play this plugin’s formats', 'El reproductor de Tomodachi no reproduce los formatos de este plugin'],
  'formato sem suporte': ['unsupported format', 'formato no compatible'],
  'Buscar legendas online…': ['Search subtitles online…', 'Buscar subtítulos en línea…'],
  // Settings → Extensões
  'Repositórios e extensões': ['Repositories and extensions', 'Repositorios y extensiones'],
  'Os repositórios e as extensões ficam junto de cada seção, em Explorar → Extensões. Lá você adiciona repositórios, instala e remove extensões. Para as extensões do Mihon funcionarem por completo, configure o Suwayomi.': [
    'Repositories and extensions live inside each section, under Explore → Extensions. There you add repositories and install or remove extensions. For Mihon extensions to fully work, set up Suwayomi.',
    'Los repositorios y las extensiones están dentro de cada sección, en Explorar → Extensiones. Allí agregas repositorios e instalas o quitas extensiones. Para que las extensiones de Mihon funcionen por completo, configura Suwayomi.',
  ],
  'Repositórios de mangá': ['Manga repositories', 'Repositorios de manga'],
  'Repositórios de anime': ['Anime repositories', 'Repositorios de anime'],
  // Torrents
  Torrents: ['Torrents', 'Torrents'],
  'Links de torrent dos addons tocam direto no app. A velocidade depende de quantas pessoas compartilham o arquivo (seeders).': [
    'Torrent links from addons play right in the app. Speed depends on how many people share the file (seeders).',
    'Los enlaces torrent de los addons se reproducen directamente en la app. La velocidad depende de cuántas personas comparten el archivo (seeders).',
  ],
  'Links de torrent (como os do Torrentio) tocam direto no app: o Tomodachi baixa só o trecho que você está assistindo e apaga tudo ao fechar o app. A velocidade depende dos seeders — se um link demorar, tente outro com mais seeders. Com um serviço de debrid (Real-Debrid, AllDebrid…) configurado no addon, os links viram diretos e começam mais rápido.': [
    'Torrent links (like Torrentio\'s) play right in the app: Tomodachi downloads only the part you are watching and deletes everything when the app closes. Speed depends on seeders — if a link is slow, try another one with more seeders. With a debrid service (Real-Debrid, AllDebrid…) set up in the addon, links become direct and start faster.',
    'Los enlaces torrent (como los de Torrentio) se reproducen directamente en la app: Tomodachi descarga solo la parte que estás viendo y borra todo al cerrar la app. La velocidad depende de los seeders: si un enlace tarda, prueba otro con más seeders. Con un servicio de debrid (Real-Debrid, AllDebrid…) configurado en el addon, los enlaces pasan a ser directos y empiezan más rápido.',
  ],
  'Torrent: peers conectados e velocidade de download': ['Torrent: connected peers and download speed', 'Torrent: peers conectados y velocidad de descarga'],
  'Não foi possível abrir o torrent': ['Could not open the torrent', 'No se pudo abrir el torrent'],
  'Torrents com poucos seeders podem demorar ou não abrir. Tente de novo ou escolha outro link.': [
    'Torrents with few seeders may be slow or fail to open. Try again or pick another link.',
    'Los torrents con pocos seeders pueden tardar o no abrir. Inténtalo de nuevo o elige otro enlace.',
  ],
  'Tentar de novo': ['Try again', 'Intentar de nuevo'],
  'Conectado a {n} peers, preparando o vídeo…': ['Connected to {n} peers, preparing the video…', 'Conectado a {n} peers, preparando el video…'],
  'Procurando peers do torrent…': ['Looking for torrent peers…', 'Buscando peers del torrent…'],
  'Está demorando: o torrent pode ter poucos seeders. Você pode esperar mais um pouco ou voltar e escolher outro link.': [
    'This is taking a while: the torrent may have few seeders. You can wait a bit longer or go back and pick another link.',
    'Está tardando: el torrent puede tener pocos seeders. Puedes esperar un poco más o volver y elegir otro enlace.',
  ],
};

export default parts;