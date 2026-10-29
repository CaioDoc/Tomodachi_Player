import type { Parts } from '../types';

// MyAnimeList: busca no Descobrir e cartão nas Configurações
const parts: Parts = {
  'O MyAnimeList recusou esse Client ID': ['MyAnimeList rejected this Client ID', 'MyAnimeList rechazó este Client ID'],
  'Confira se copiou o Client ID (e não o Client Secret) da página de API do MAL.': [
    'Make sure you copied the Client ID (not the Client Secret) from the MAL API page.',
    'Revisa que copiaste el Client ID (y no el Client Secret) de la página de API de MAL.',
  ],
  'Client ID salvo': ['Client ID saved', 'Client ID guardado'],
  'A busca agora usa a API oficial do MyAnimeList.': ['Search now uses the official MyAnimeList API.', 'La búsqueda ahora usa la API oficial de MyAnimeList.'],
  'Não deu para testar agora ({error}). Se a API oficial falhar, a busca usa o Jikan.': [
    "Couldn't test it right now ({error}). If the official API fails, search falls back to Jikan.",
    'No se pudo probar ahora ({error}). Si la API oficial falla, la búsqueda usa Jikan.',
  ],
  'Client ID removido': ['Client ID removed', 'Client ID eliminado'],
  'A busca volta a usar o Jikan, sem chave.': ['Search goes back to Jikan, no key needed.', 'La búsqueda vuelve a usar Jikan, sin clave.'],
  'Buscar no MyAnimeList': ['Search MyAnimeList', 'Buscar en MyAnimeList'],
  'Mostrar resultados do MyAnimeList na busca': ['Show MyAnimeList results in search', 'Mostrar resultados de MyAnimeList en la búsqueda'],
  'Na aba Animes do Descobrir, a busca também mostra os resultados do MyAnimeList. Ao abrir um deles, você vai para a página completa da obra (episódios, "Assistir" e "Talvez você goste").': [
    'In Discover → Anime, search also shows MyAnimeList results. Opening one takes you to the full title page (episodes, "Watch" and "You might also like").',
    'En Descubrir → Animes, la búsqueda también muestra resultados de MyAnimeList. Al abrir uno, vas a la página completa de la obra (episodios, "Ver" y "Quizás te guste").',
  ],
  'API oficial (opcional)': ['Official API (optional)', 'API oficial (opcional)'],
  'Usando o seu Client ID': ['Using your Client ID', 'Usando tu Client ID'],
  'Sem chave: usando o Jikan (espelho público do MAL)': ['No key: using Jikan (public MAL mirror)', 'Sin clave: usando Jikan (espejo público de MAL)'],
  'Funciona sem configurar nada. Se quiser usar a API oficial, crie um app em myanimelist.net/apiconfig e cole aqui só o Client ID.': [
    'Works with no setup. To use the official API, create an app at myanimelist.net/apiconfig and paste only the Client ID here.',
    'Funciona sin configurar nada. Para usar la API oficial, crea una app en myanimelist.net/apiconfig y pega aquí solo el Client ID.',
  ],
  'Colar outro Client ID': ['Paste another Client ID', 'Pegar otro Client ID'],
  'Client ID do MyAnimeList': ['MyAnimeList Client ID', 'Client ID de MyAnimeList'],
  Ocultar: ['Hide', 'Ocultar'],
  Mostrar: ['Show', 'Mostrar'],
  'Testando…': ['Testing…', 'Probando…'],
  'Testar e salvar': ['Test and save', 'Probar y guardar'],
  'Isso parece o Client Secret. Ele não é necessário e não deve ser colado em lugar nenhum: use só o Client ID.': [
    "That looks like the Client Secret. It isn't needed and shouldn't be pasted anywhere: use only the Client ID.",
    'Eso parece el Client Secret. No hace falta y no debe pegarse en ningún lugar: usa solo el Client ID.',
  ],
  'O Client ID tem só letras e números (normalmente 32 caracteres).': ['The Client ID has only letters and numbers (usually 32 characters).', 'El Client ID tiene solo letras y números (normalmente 32 caracteres).'],
  'O Client ID fica guardado criptografado neste computador.': ['The Client ID is stored encrypted on this computer.', 'El Client ID se guarda cifrado en este equipo.'],
  'Página de API do MAL': ['MAL API page', 'Página de API de MAL'],
  'animes · nota do MAL': ['anime · MAL score', 'animes · nota de MAL'],
  'o MAL recusou o seu Client ID; usando o Jikan': ['MAL rejected your Client ID; using Jikan', 'MAL rechazó tu Client ID; usando Jikan'],
  'animes · API oficial': ['anime · official API', 'animes · API oficial'],
  'No MyAnimeList': ['On MyAnimeList', 'En MyAnimeList'],
  'Nas suas fontes e no MyAnimeList': ['In your sources and on MyAnimeList', 'En tus fuentes y en MyAnimeList'],
  'Procuramos no {src}, no MyAnimeList e em {n} fontes suas. Confira a grafia ou tente o nome em inglês ou japonês.': [
    'We searched {src}, MyAnimeList and {n} of your sources. Check the spelling or try the English or Japanese title.',
    'Buscamos en {src}, en MyAnimeList y en {n} de tus fuentes. Revisa la ortografía o prueba el nombre en inglés o japonés.',
  ],
  'Procuramos no {src} e no MyAnimeList. Confira a grafia ou tente o nome em inglês ou japonês.': [
    'We searched {src} and MyAnimeList. Check the spelling or try the English or Japanese title.',
    'Buscamos en {src} y en MyAnimeList. Revisa la ortografía o prueba el nombre en inglés o japonés.',
  ],
  'Disponível só no app instalado': ['Only available in the installed app', 'Solo disponible en la app instalada'],
  Especial: ['Special', 'Especial'],
  Música: ['Music', 'Música'],
};

export default parts;
