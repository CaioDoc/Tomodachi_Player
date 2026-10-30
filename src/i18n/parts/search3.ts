import type { Parts } from '../types';

// Busca só nas fontes (por relevância), modo anônimo e "Assistir" sempre no player
const parts: Parts = {
  'nas suas fontes, das que mais batem com "{q}" para as que menos batem': ['in your sources, from the closest match to "{q}" to the loosest', 'en tus fuentes, de las que más coinciden con "{q}" a las que menos'],
  'Nota no {site}': ['Score on {site}', 'Nota en {site}'],
  'Escolher a fonte': ['Choose the source', 'Elegir la fuente'],
  'Abrir em': ['Open in', 'Abrir en'],
  '{n} obra encontrada': ['{n} title found', '{n} obra encontrada'],
  '{n} obras encontradas': ['{n} titles found', '{n} obras encontradas'],
  '{n} fonte sem resultado': ['{n} source with no results', '{n} fuente sin resultados'],
  '{n} fontes sem resultado': ['{n} sources with no results', '{n} fuentes sin resultados'],
  'Você ainda não tem fontes para buscar': ["You don't have any sources to search yet", 'Todavía no tienes fuentes para buscar'],
  'A busca mostra só o que as suas extensões, addons e plugins têm. Adicione uma fonte (é só colar o link) e busque de novo.': [
    'Search only shows what your extensions, add-ons and plugins have. Add a source (just paste the link) and search again.',
    'La búsqueda muestra solo lo que tienen tus extensiones, addons y plugins. Agrega una fuente (solo pega el enlace) y busca de nuevo.',
  ],
  'Buscar sem filtrar por tipo': ['Search without filtering by type', 'Buscar sin filtrar por tipo'],
  'Sua fonte não tem uma obra com esse nome. Confira a grafia, tente o nome em inglês ou japonês, ou adicione mais fontes.': [
    "Your source doesn't have a title with that name. Check the spelling, try the English or Japanese title, or add more sources.",
    'Tu fuente no tiene una obra con ese nombre. Revisa la ortografía, prueba el nombre en inglés o japonés, o agrega más fuentes.',
  ],
  'Nenhuma das suas {n} fontes tem uma obra com esse nome. Confira a grafia, tente o nome em inglês ou japonês, ou adicione mais fontes.': [
    "None of your {n} sources has a title with that name. Check the spelling, try the English or Japanese title, or add more sources.",
    'Ninguna de tus {n} fuentes tiene una obra con ese nombre. Revisa la ortografía, prueba el nombre en inglés o japonés, o agrega más fuentes.',
  ],
  'Usar na busca': ['Use in search', 'Usar en la búsqueda'],
  'Usar o MyAnimeList na busca': ['Use MyAnimeList in search', 'Usar MyAnimeList en la búsqueda'],
  'A busca do Descobrir usa o MyAnimeList para completar o que as suas fontes encontram: nota do MAL, capa e nomes alternativos (ex.: buscar "Attack on Titan" acha "Shingeki no Kyojin").': [
    'Discover search uses MyAnimeList to complete what your sources find: MAL score, cover and alternative titles (e.g. searching "Attack on Titan" finds "Shingeki no Kyojin").',
    'La búsqueda de Descubrir usa MyAnimeList para completar lo que encuentran tus fuentes: nota de MAL, portada y nombres alternativos (ej.: buscar "Attack on Titan" encuentra "Shingeki no Kyojin").',
  ],
  'o que você assistir': ['what you watch', 'lo que veas'],
  'o que você ler': ['what you read', 'lo que leas'],
  'Modo anônimo ligado': ['Incognito mode on', 'Modo incógnito activado'],
  'Até você desligar ou fechar o app, {what} não fica salvo: sem histórico, "Continuar", progresso nem AniList.': [
    'Until you turn it off or close the app, {what} is not saved: no history, "Continue", progress or AniList.',
    'Hasta que lo apagues o cierres la app, {what} no se guarda: sin historial, "Continuar", progreso ni AniList.',
  ],
  'Modo anônimo desligado': ['Incognito mode off', 'Modo incógnito desactivado'],
  'O progresso volta a ser salvo normalmente.': ['Progress is saved normally again.', 'El progreso vuelve a guardarse normalmente.'],
  'Modo anônimo ligado: nada do que você assistir ou ler fica salvo. Clique para desligar.': [
    'Incognito mode on: nothing you watch or read is saved. Click to turn it off.',
    'Modo incógnito activado: nada de lo que veas o leas se guarda. Haz clic para desactivarlo.',
  ],
  'Modo anônimo: assistir e ler sem salvar histórico nem progresso': ['Incognito mode: watch and read without saving history or progress', 'Modo incógnito: ver y leer sin guardar historial ni progreso'],
  Anônimo: ['Incognito', 'Incógnito'],
  'Modo anônimo: nada deste {what} fica salvo': ['Incognito mode: nothing from this {what} is saved', 'Modo incógnito: nada de este {what} se guarda'],
  vídeo: ['video', 'video'],
  capítulo: ['chapter', 'capítulo'],
  'O site não entregou o vídeo': ["The site didn't provide the video", 'El sitio no entregó el video'],
  'Nenhum servidor entregou o vídeo': ['No server provided the video', 'Ningún servidor entregó el video'],
  'Não deu para tocar este episódio por esta fonte': ["Couldn't play this episode from this source", 'No se pudo reproducir este episodio desde esta fuente'],
  'O site não entregou o vídeo para o player do app. Tente de novo ou escolha outra fonte: o vídeo sempre toca aqui dentro.': [
    "The site didn't hand the video to the app's player. Try again or pick another source: videos always play right here.",
    'El sitio no entregó el video al reproductor de la app. Inténtalo de nuevo o elige otra fuente: el video siempre se reproduce aquí dentro.',
  ],
  'Procurar em outras fontes': ['Look in other sources', 'Buscar en otras fuentes'],
};

export default parts;
