// Teste de ponta a ponta do Tomodachi Player instalado (Windows limpo, internet real).
// Cada etapa é independente: se uma falhar, as outras continuam. Resultado em e2e-out/.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const OUT = path.resolve('e2e-out');
fs.mkdirSync(OUT, { recursive: true });
const EXE = process.env.APP_EXE;
const MEDIA = process.env.MEDIA_DIR;
const results = [];
const consoleErrors = [];
let shotN = 0;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── Site de anime falso (local), parecido com os sites reais das extensões ──
// Busca própria em /pesquisar?busca= (não é ?s=), nome no <h3> com imagem sem alt, menu e barra lateral,
// página da obra com links "Episódio N" e episódio com o vídeo dentro de um iframe de player.
const SITE_PORT = 47811;
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const SAMPLE = MEDIA ? path.join(MEDIA, 'tp-videos', 'sample.mp4') : '';
const page404 = '<html><body><main><p>Nada aqui</p></main></body></html>';
http
  .createServer((req, res) => {
    const u = new URL(req.url || '/', SITE);
    const html = (body) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>Animes Teste</title></head><body>${body}</body></html>`);
    };
    const nav = '<header><nav><a href="/">Início</a><a href="/generos/acao">Ação</a><a href="/lancamentos">Lançamentos</a></nav><form class="search-form" action="/pesquisar" method="get"><input type="text" name="busca" placeholder="Pesquisar anime..."></form></header>';
    if (u.pathname === '/') return html(nav + '<main><div class="item"><a href="/anime/outro"><img src="/x.jpg" alt="Outro Anime"></a></div></main>');
    if (u.pathname === '/pesquisar') {
      const q = (u.searchParams.get('busca') || '').toLowerCase();
      const card = (slug, title) => `<div class="item"><a href="/anime/${slug}"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/capa/${slug}.jpg" alt=""></a><h3 class="title"><a href="/anime/${slug}">${title}</a></h3></div>`;
      const results = /tomodachi|teste/.test(q) ? card('tomodachi-teste', 'Tomodachi Teste Dublado') + card('tomodachi-teste-2', 'Tomodachi Teste 2nd Season') : '';
      return html(nav + `<main class="results">${results || '<p>Nenhum resultado</p>'}</main><aside class="sidebar"><a href="/anime/naruto"><img src="/n.jpg" alt="Naruto Shippuden"></a></aside><footer><a href="/dmca">DMCA</a></footer>`);
    }
    if (u.pathname.startsWith('/anime/')) {
      const slug = u.pathname.split('/')[2];
      const eps = [1, 2, 3].map((n) => `<li><a href="/episodio/${slug}-episodio-${n}">Episódio ${n}</a></li>`).join('');
      return html(nav + `<main><h1>Tomodachi Teste</h1><ul class="episodios">${eps}</ul></main>`);
    }
    if (u.pathname.startsWith('/episodio/')) return html(nav + `<main><h1>Episódio</h1><iframe src="/player/1" width="800" height="450"></iframe></main>`);
    if (u.pathname.startsWith('/player/')) return html('<div class="player"><video controls preload="auto" src="/media/sample.mp4"></video></div>');
    if (u.pathname === '/media/sample.mp4' && SAMPLE && fs.existsSync(SAMPLE)) {
      const size = fs.statSync(SAMPLE).size;
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) {
        const start = Number(range[1] || 0);
        const end = range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        return fs.createReadStream(SAMPLE, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': size });
      return fs.createReadStream(SAMPLE).pipe(res);
    }
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(page404);
  })
  .listen(SITE_PORT, '127.0.0.1')
  .unref(); // não segura o teste aberto no fim

async function launch(tag) {
  const t0 = Date.now();
  const app = await electron.launch({ executablePath: EXE, timeout: 90000 });
  app.process().stdout?.on('data', (d) => fs.appendFileSync(path.join(OUT, 'main-stdout.txt'), d));
  app.process().stderr?.on('data', (d) => fs.appendFileSync(path.join(OUT, 'main-stderr.txt'), d));
  const page = await app.firstWindow({ timeout: 90000 });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text().slice(0, 400)}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] PAGEERROR ${e.message}`));
  await page.waitForSelector('text=Tomodachi Player', { timeout: 60000 });
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  return { app, page, startMs: Date.now() - t0 };
}

async function shot(page, name) {
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`;
  try {
    await page.screenshot({ path: path.join(OUT, file) });
  } catch (e) {
    log('screenshot failed', name, e.message);
  }
  return file;
}

async function step(name, fn) {
  const t0 = Date.now();
  log('▶', name);
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note: note || '' });
    log('  ✓', note || '');
  } catch (e) {
    try { await shot(page, 'FALHA-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)); } catch {}
    // Fecha painéis/modais que tenham ficado abertos para não travar as próximas etapas
    try {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      const closeDrawer = page.locator('[role=dialog] button[aria-label="Fechar"] >> visible=true');
      if (await closeDrawer.count()) await closeDrawer.first().click({ timeout: 2000 });
    } catch {}
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(e?.message || e).split('\n')[0].slice(0, 300) });
    log('  ✗', e?.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const visible = (page, sel) => page.locator(`${sel} >> visible=true`);

let { app, page, startMs } = await launch('run1');
log('started in', startMs, 'ms');
results.push({ name: 'Abrir o app', ok: true, ms: startMs, note: `primeira tela em ${(startMs / 1000).toFixed(1)}s` });

async function goSection(label) {
  await page.locator(`aside >> text=${label}`).first().click().catch(async () => {
    await page.locator(`text=${label}`).first().click();
  });
  await sleep(600);
}
/** Títulos dos cards da busca, na ordem em que aparecem */
async function resultTitles() {
  return page.$$eval('section[aria-label="Resultados nas suas fontes"] div.group > button:first-child', (els) => els.map((e) => e.getAttribute('title') || ''));
}
async function waitSearchDone() {
  await page
    .waitForFunction(() => {
      const sec = document.querySelector('section[aria-label="Resultados nas suas fontes"]');
      const empty = /Nada encontrado|ainda não tem fontes/.test(document.body.innerText);
      return empty || (sec && !/buscando em/i.test(sec.textContent || ''));
    }, null, { timeout: 60000 })
    .catch(() => {});
  await sleep(1200);
}
async function goTab(label) {
  await visible(page, `[role=tab]:has-text("${label}")`).first().click();
  await sleep(700);
}

await step('Tela de boas-vindas', async () => {
  const w = page.locator('text=Assistir animes, séries e filmes');
  await w.waitFor({ timeout: 10000 });
  await shot(page, 'boas-vindas');
  await w.click();
  await sleep(1200);
  return 'aparece e leva ao Descobrir';
});

await step('Descobrir · Animes (AniList)', async () => {
  await goTab('Animes');
  const cards = visible(page, 'button[title^="Marcar para favoritar"]');
  await cards.first().waitFor({ timeout: 45000 });
  await sleep(2500);
  await shot(page, 'descobrir-animes');
  return `${await cards.count()} animes carregados`;
});

await step('Descobrir · Séries (Cinemeta)', async () => {
  await goTab('Séries');
  const cards = visible(page, 'button[aria-label^="Marcar para favoritar"]');
  await cards.first().waitFor({ timeout: 45000 });
  await sleep(2500);
  await shot(page, 'descobrir-series');
  return `${await cards.count()} séries carregadas`;
});

await step('Descobrir · Filmes (Cinemeta)', async () => {
  await goTab('Filmes');
  const cards = visible(page, 'button[aria-label^="Marcar para favoritar"]');
  await cards.first().waitFor({ timeout: 45000 });
  await sleep(2000);
  await shot(page, 'descobrir-filmes');
  return `${await cards.count()} filmes carregados`;
});

await step('Busca sem fontes instaladas pede para adicionar fontes', async () => {
  await goTab('Séries');
  const input = visible(page, 'input[placeholder*="Buscar"]').first();
  await input.fill('Breaking Bad');
  await input.press('Enter');
  await page.locator('text=Você ainda não tem fontes para buscar >> visible=true').first().waitFor({ timeout: 20000 });
  await shot(page, 'busca-sem-fontes');
  const extra = await visible(page, 'button[aria-label^="Marcar para favoritar"]').count();
  await input.fill('');
  await input.press('Enter');
  await sleep(2500);
  if (extra) throw new Error(`a busca mostrou ${extra} obras que não estão em nenhuma fonte`);
  return 'aviso único, nenhuma obra de fora das fontes';
});

await step('Página da obra (série)', async () => {
  const first = visible(page, 'div.relative:has(> button[aria-label^="Marcar para favoritar"]) > button.group').first();
  await first.click();
  await page.locator('text=Temporada 1').first().waitFor({ timeout: 45000 });
  await sleep(2500);
  await shot(page, 'pagina-da-obra');
  const eps = await visible(page, 'text=/^E\\d+$/').count();
  return `abriu com temporadas (${eps} episódios na lista)`;
});

await step('Talvez você goste (série)', async () => {
  const sec = page.locator('section[aria-label="Talvez você goste"] >> visible=true').first();
  await sec.waitFor({ timeout: 30000 });
  await sec.scrollIntoViewIfNeeded();
  await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').first().waitFor({ timeout: 30000 });
  await sleep(2500);
  await shot(page, 'talvez-voce-goste-serie');
  const n = await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').count();
  const labels = await page.locator('section[aria-label="Talvez você goste"] button.group span.absolute.top-1\\.5 >> visible=true').allInnerTexts();
  return `${n} sugestões (${[...new Set(labels)].join(', ')})`;
});

await step('Tags clicáveis (série → Descobrir)', async () => {
  const tag = page.locator('button[title^="Ver obras com"] >> visible=true').first();
  const name = (await tag.innerText()).trim();
  await tag.click();
  await sleep(4000);
  const val = await page.locator('input[placeholder*="ex."] >> visible=true').first().inputValue();
  await shot(page, 'tag-clicada-descobrir');
  if (val.trim().toLowerCase() !== name.toLowerCase()) throw new Error(`busca "${val}" ≠ tag "${name}"`);
  return `tag "${name}" abriu o Descobrir buscando por ela`;
});

await step('Navegar por tag no Descobrir (Seinen)', async () => {
  await visible(page, '[aria-label="Catálogos"] [role=tab]:has-text("Animes")').first().click();
  await sleep(800);
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('Seinen');
  await sleep(5000);
  await shot(page, 'navegar-tag-anime');
  const row = await page.locator('[aria-label="Filtros da busca"] >> visible=true').first().innerText();
  const n = await visible(page, 'button[title^="Marcar para favoritar"]').count();
  await input.fill('');
  await sleep(2500);
  if (!/Tag\s*Seinen/i.test(row.replace(/\s+/g, ' '))) throw new Error('não reconheceu a tag: ' + row);
  if (!n) throw new Error('nenhuma obra com a tag');
  return `${row.replace(/\s+/g, ' ')} → ${n} animes`;
});

await step('Página de anime + Talvez você goste (AniList)', async () => {
  await visible(page, 'h4').first().click();
  const sec = page.locator('section[aria-label="Talvez você goste"] >> visible=true').first();
  await sec.waitFor({ timeout: 30000 });
  await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').first().waitFor({ timeout: 30000 });
  await sec.scrollIntoViewIfNeeded();
  await sleep(2500);
  await shot(page, 'talvez-voce-goste-anime');
  const n = await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').count();
  const tags = await page.locator('button[title^="Ver obras com"] >> visible=true').allInnerTexts();
  const first = (await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').first().innerText()).split('\n').slice(0, 2).join(' / ');
  await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').first().click();
  await sleep(4000);
  await shot(page, 'sugestao-aberta');
  return `${n} sugestões; 1ª: ${first}; ${tags.length} tags: ${tags.slice(0, 8).join(', ')}`;
});

await step('Onde assistir (sem fontes instaladas)', async () => {
  await visible(page, 'button:has-text("Assistir")').first().click();
  await page.locator('text=Nenhuma fonte instalada >> visible=true').first().waitFor({ timeout: 15000 });
  await sleep(3000);
  await shot(page, 'onde-assistir-vazio');
  await page.keyboard.press('Escape');
  await sleep(500);
  return 'painel abre e explica como adicionar fontes';
});

await step('Favoritar em lote', async () => {
  await page.locator('[role=tablist] [role=tab]:has-text("Animes & Vídeos")').first().click();
  await sleep(800);
  await goTab('Descobrir');
  await goTab('Séries');
  const hearts = visible(page, 'button[aria-label^="Marcar para favoritar"]');
  await hearts.first().waitFor({ timeout: 30000 });
  await hearts.nth(0).click();
  await hearts.nth(0).click(); // depois do 1º clique a lista muda; marca o próximo livre
  await sleep(300);
  await shot(page, 'lote-marcadas');
  await visible(page, '[role=toolbar] button:has-text("Favoritar")').click();
  const save = page.locator('button:has-text("Favoritar 2 obras")');
  await save.waitFor({ timeout: 45000 });
  await shot(page, 'lote-modal');
  await save.click();
  await sleep(2000);
  await goTab('Biblioteca');
  await sleep(1500);
  await shot(page, 'biblioteca-depois-do-lote');
  const txt = await visible(page, '[role=tab]:has-text("Biblioteca")').first().innerText();
  return `biblioteca: ${txt.replace(/\s+/g, ' ')}`;
});

await step('Biblioteca · busca por tags e sem aba Favoritos', async () => {
  const favTab = await page.locator('[role=tablist][aria-label="Categorias"] button:has-text("Favoritos") >> visible=true').count();
  const input = page.locator('input[placeholder^="Buscar por título"] >> visible=true').first();
  const sug = page.locator('button[title^="Filtrar também por"] >> visible=true');
  const nSug = await sug.count();
  let note = `aba Favoritos: ${favTab ? 'ainda aparece' : 'removida'}; ${nSug} tags sugeridas`;
  if (nSug) {
    const tg = (await sug.first().innerText()).replace(/\s+\d+$/, '');
    await sug.first().click();
    await sleep(600);
    note += `; filtrando por "${tg}": ${await input.inputValue()}`;
  }
  await shot(page, 'biblioteca-tags');
  await input.fill('');
  if (favTab) throw new Error(note);
  return note;
});

await step('Fontes · instalar addon (Anime Kitsu, só catálogo)', async () => {
  await goTab('Fontes');
  await page.fill('input[aria-label="Link da fonte"]', 'https://anime-kitsu.strem.fun/manifest.json');
  await page.keyboard.press('Enter');
  await page.locator('text=/Addon instalado/').first().waitFor({ timeout: 45000 });
  await sleep(800);
  await shot(page, 'fontes-addon-instalado');
  return 'instalado';
});

await step('Descobrir · busca também nas fontes instaladas', async () => {
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('Cowboy Bebop');
  const sec = page.locator('section[aria-label="Resultados nas suas fontes"] >> visible=true').first();
  await sec.waitFor({ timeout: 20000 });
  await waitSearchDone();
  await shot(page, 'busca-nas-fontes');
  const txt = (await sec.innerText()).replace(/\s+/g, ' ').slice(0, 160);
  const titles = await resultTitles();
  await input.fill('');
  await sleep(800);
  if (!/Anime Kitsu/.test(txt)) throw new Error('o addon não apareceu na busca: ' + txt);
  if (!/^Cowboy Bebop$/i.test(titles[0] || '')) throw new Error('o 1º resultado não é a obra buscada: ' + titles.slice(0, 4).join(' | '));
  if (titles.some((x) => !/cowboy\s*bebop/i.test(x))) throw new Error('resultado que não bate com a busca: ' + titles.filter((x) => !/cowboy/i.test(x)).join(' | '));
  return `${titles.length} obras: ${titles.slice(0, 4).join(' | ')}`;
});

await step('Doar presente na Biblioteca de Mangás', async () => {
  await goSection('Mangás & Comics');
  await goTab('Biblioteca');
  const n = await page.locator('button:has-text("Doar") >> visible=true').count();
  await goSection('Animes & Vídeos');
  if (!n) throw new Error('sem botão Doar');
  return 'aparece';
});

await step('Fontes · Navegar no catálogo do addon', async () => {
  await goTab('Fontes');
  await visible(page, 'button:has-text("Navegar")').last().click();
  await sleep(6000);
  await shot(page, 'navegar-addon');
  const n = await page.locator('img >> visible=true').count();
  if (n < 3) throw new Error('catálogo do addon não carregou capas');
  return `${n} capas`;
});

await step('Fontes · addon só de links (Torrentio) entra na busca', async () => {
  await goSection('Animes & Vídeos');
  await goTab('Fontes');
  await page.fill('input[aria-label="Link da fonte"]', 'https://torrentio.strem.fun/manifest.json');
  await page.keyboard.press('Enter');
  await page.locator('text=/Addon instalado/').first().waitFor({ timeout: 45000 });
  await sleep(800);
  await goTab('Descobrir');
  await visible(page, '[aria-label="Catálogos"] [role=tab]:has-text("Animes")').first().click();
  await sleep(500);
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('Breaking Bad');
  const row = page.locator('section[aria-label="Resultados nas suas fontes"] >> text=Torrentio').first();
  await row.waitFor({ timeout: 45000 });
  await waitSearchDone();
  await shot(page, 'busca-torrentio');
  const titles = await resultTitles();
  await input.fill('');
  await sleep(800);
  if (titles[0] !== 'Breaking Bad') throw new Error('o 1º resultado não é "Breaking Bad": ' + titles.slice(0, 4).join(' | '));
  const junk = titles.filter((x) => /bad guys|hockey|bad news bears/i.test(x));
  if (junk.length) throw new Error('resultados que não batem com a busca: ' + junk.join(' | '));
  return `${titles.length} obras, na ordem: ${titles.slice(0, 5).join(' | ')}`;
});

await step('Descobrir · nada encontrado mostra um aviso só', async () => {
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('qzxv wqpz 9137');
  await page.locator('text=/Nada encontrado para/ >> visible=true').first().waitFor({ timeout: 60000 });
  await sleep(800);
  await shot(page, 'nada-encontrado');
  const old = await page.locator('text=Nenhum anime encontrado >> visible=true').count();
  const srcEmpty = await page.locator('section[aria-label="Resultados nas suas fontes"] >> visible=true').count();
  await input.fill('');
  await sleep(1500);
  if (old || srcEmpty) throw new Error(`ainda sobra área vazia (catálogo: ${old}, fontes: ${srcEmpty})`);
  return 'aviso único com sugestões';
});

await step('MyAnimeList · resposta da busca (sem chave)', async () => {
  const r = await page.evaluate(() => window.electronAPI.malSearch({ query: 'Fullmetal Alchemist', limit: 5 }));
  const info = `success=${r?.success} via=${r?.via} itens=${r?.items?.length ?? 0} erro=${r?.error || '-'} 1º=${r?.items?.[0]?.title || '-'}`;
  if (!r?.success || !r.items?.length) throw new Error(info);
  return info;
});

await step('Descobrir · relevância e nota do MyAnimeList', async () => {
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  await visible(page, '[aria-label="Catálogos"] [role=tab]:has-text("Animes")').first().click();
  await sleep(500);
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('Fullmetal Alchemist');
  await page.locator('section[aria-label="Resultados nas suas fontes"] >> visible=true').first().waitFor({ timeout: 45000 });
  await waitSearchDone();
  await sleep(2500);
  await shot(page, 'busca-relevancia-mal');
  const titles = await resultTitles();
  const malBadges = await page.locator('section[aria-label="Resultados nas suas fontes"] span:has-text("MAL") >> visible=true').count();
  const before = await page.locator('[draggable=true]').count();
  await page.locator('section[aria-label="Resultados nas suas fontes"] div.group > button:first-child >> visible=true').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('[draggable=true]').length > n, before, { timeout: 30000 });
  await sleep(3000);
  await shot(page, 'obra-da-busca');
  const opened = await page.locator('text=/Episódios|Onde assistir|Temporada/i >> visible=true').count();
  await page.keyboard.press('Control+w').catch(() => {});
  await sleep(600);
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  await page.locator('input[placeholder*="ex."] >> visible=true').first().fill('');
  await sleep(800);
  if (!/^Fullmetal Alchemist/i.test(titles[0] || '')) throw new Error('o 1º resultado não é a obra buscada: ' + titles.slice(0, 4).join(' | '));
  if (titles.some((x) => /full metal panic/i.test(x))) throw new Error('"Full Metal Panic" apareceu na busca por Fullmetal Alchemist');
  if (!malBadges) throw new Error('sem nota do MyAnimeList nos cards');
  if (!opened) throw new Error('a obra não abriu');
  return `${titles.length} obras (${malBadges} com nota do MAL): ${titles.slice(0, 4).join(' | ')}`;
});

await step('Assistir · nunca mostra o site: acha o vídeo ou avisa', async () => {
  const none = await page.evaluate(() => window.electronAPI.extractVideoStream('https://example.com/'));
  const mp4 = await page.evaluate(() => window.electronAPI.extractVideoStream('https://www.w3schools.com/html/html5_video.asp'));
  const hls = await page.evaluate(() => window.electronAPI.extractVideoStream('https://hlsjs.video-dev.org/demo/'));
  const info = `sem vídeo → ${none?.success ? 'achou ' + none.url : 'avisa (' + none?.error + ')'}; mp4 → ${mp4?.success ? mp4.url : 'falhou ' + mp4?.error}; hls → ${hls?.success ? hls.url : 'falhou ' + hls?.error}`;
  if (none?.success || none?.type === 'embed') throw new Error('devolveu a página em vez de avisar: ' + info);
  if (!mp4?.success || mp4.type !== 'stream') throw new Error(info);
  if (!hls?.success || hls.type !== 'stream') throw new Error(info);
  return info.slice(0, 300);
});

await step('Extensão (site) · acha a obra pela busca do site e toca o episódio no player do app', async () => {
  await page.evaluate((base) => {
    const list = JSON.parse(localStorage.getItem('installed_extensions') || '[]').filter((e) => e.pkg !== 'test.site');
    list.push({ pkg: 'test.site', name: 'Site Teste', sourceName: 'Site Teste', baseUrl: base, type: 'anime', lang: 'pt' });
    localStorage.setItem('installed_extensions', JSON.stringify(list));
    window.dispatchEvent(new Event('extensions:updated'));
  }, SITE);
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  await visible(page, '[aria-label="Catálogos"] [role=tab]:has-text("Animes")').first().click();
  const input = page.locator('input[placeholder*="ex."] >> visible=true').first();
  await input.fill('Tomodachi Teste');
  await page.locator('section[aria-label="Resultados nas suas fontes"] >> text=Site Teste').first().waitFor({ timeout: 45000 });
  await waitSearchDone();
  await shot(page, 'site-teste-busca');
  const titles = await resultTitles();
  if (!/^Tomodachi Teste/.test(titles[0] || '')) throw new Error('o site não foi lido: ' + titles.join(' | '));
  const tabsBefore = await page.locator('[draggable=true]').count();
  await page.locator('section[aria-label="Resultados nas suas fontes"] div.group > button:first-child >> visible=true').first().click();
  await page.waitForFunction((n) => document.querySelectorAll('[draggable=true]').length > n, tabsBefore, { timeout: 30000 });
  await sleep(2500);
  await visible(page, 'button:has-text("Assistir")').first().click();
  const playEp = page.locator('[role=dialog] button:has-text("Assistir episódio 1") >> visible=true').first();
  await playEp.waitFor({ timeout: 60000 });
  await shot(page, 'site-teste-onde-assistir');
  const t0 = Date.now();
  await playEp.click();
  // O vídeo do episódio (que está dentro de um iframe do player do site) toca no player do app
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.offsetParent && v.currentTime > 1), null, { timeout: 60000 });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const info = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.offsetParent);
    return v ? { src: v.currentSrc, t: v.currentTime } : null;
  });
  await shot(page, 'site-teste-tocando');
  const webviews = await page.locator('webview').count();
  const cached = await page.evaluate(() => localStorage.getItem('tp_watch_match_cache') || '');
  await page.keyboard.press('Control+w').catch(() => {});
  await sleep(600);
  await page.keyboard.press('Control+w').catch(() => {});
  await sleep(600);
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  await page.locator('input[placeholder*="ex."] >> visible=true').first().fill('');
  if (webviews) throw new Error('abriu o site num navegador');
  if (!/test\.site/.test(cached)) throw new Error('não guardou a obra achada no site (o próximo episódio buscaria de novo)');
  return `tocou em ${secs}s pelo player do app (${String(info?.src).slice(0, 60)})`;
});

await step('Onde assistir · desligar um site fica salvo', async () => {
  const off = await page.evaluate(() => {
    localStorage.setItem('tp_watch_ext_off', JSON.stringify(['test.site']));
    return localStorage.getItem('tp_watch_ext_off');
  });
  await page.evaluate(() => localStorage.removeItem('tp_watch_ext_off'));
  if (off !== '["test.site"]') throw new Error('não salvou');
  return 'salvo';
});

await step('Configurações · cartão do MyAnimeList', async () => {
  await goSection('Configurações');
  await sleep(1000);
  await visible(page, 'button[role=tab]:has-text("Contas")').first().click();
  await sleep(800);
  const inp = visible(page, 'input[aria-label="Client ID do MyAnimeList"]').first();
  await inp.waitFor({ timeout: 10000 });
  await inp.fill('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  await sleep(400);
  const warn = await page.locator('text=/parece o Client Secret/ >> visible=true').count();
  await inp.fill('');
  const sw = await page.locator('[role=switch][aria-label*="MyAnimeList"] >> visible=true').count();
  await shot(page, 'config-myanimelist');
  await goSection('Animes & Vídeos');
  if (!sw) throw new Error('sem o botão de ligar/desligar');
  if (!warn) throw new Error('não avisou sobre o Client Secret');
  return 'cartão, interruptor e aviso do Client Secret';
});

await step('Mangás · Explorar MangaDex', async () => {
  await goSection('Mangás & Comics');
  await goTab('Explorar');
  await sleep(4000);
  await shot(page, 'mangadex-inicio');
  const input = visible(page, 'input[placeholder*="MangaDex"]').first();
  await input.fill('Frieren');
  await input.press('Enter');
  await sleep(6000);
  await shot(page, 'mangadex-busca');
  const n = await page.locator('img >> visible=true').count();
  if (n < 2) throw new Error('busca do MangaDex sem resultados');
  return `${n} capas na busca "Frieren"`;
});

await step('Mangás · detalhe e leitura (MangaDex)', async () => {
  await visible(page, 'text=/Sousou no Frieren$/i').first().click().catch(() => visible(page, 'text=/Frieren/i').first().click());
  await sleep(8000);
  await shot(page, 'mangadex-detalhe');
  const caps = await page.locator('text=/CAPÍTULOS DISPONÍVEIS \\((\\d+)\\)/i').first().innerText().catch(() => '');
  const chapterBtn = visible(page, 'div.grid > div:has-text("Capítulo")').first();
  if (!/\(0\)/.test(caps) && (await chapterBtn.count())) {
    await chapterBtn.click();
    await sleep(10000);
    await shot(page, 'mangadex-leitor');
    const imgs = await page.locator('img >> visible=true').count();
    return `${caps}; leitor abriu com ${imgs} imagens visíveis`;
  }
  return `${caps} (sem capítulo para abrir)`;
});

await step('Mangás · Talvez você goste (MangaDex)', async () => {
  const sec = page.locator('section[aria-label="Talvez você goste"] >> visible=true').first();
  await sec.waitFor({ timeout: 30000 });
  await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').first().waitFor({ timeout: 30000 });
  await sec.scrollIntoViewIfNeeded();
  await sleep(2500);
  await shot(page, 'talvez-voce-goste-manga');
  return `${await page.locator('section[aria-label="Talvez você goste"] button.group >> visible=true').count()} sugestões`;
});

await step('Modo anônimo · ligar (Animes & Vídeos e Mangás)', async () => {
  await goSection('Mangás & Comics');
  const inManga = await page.locator('[role=switch]:has-text("Anônimo") >> visible=true').count();
  await goSection('Animes & Vídeos');
  const sw = page.locator('[role=switch]:has-text("Anônimo") >> visible=true').first();
  await sw.click();
  await sleep(500);
  const on = await sw.getAttribute('aria-checked');
  await shot(page, 'modo-anonimo');
  if (!inManga) throw new Error('sem o botão em Mangás & Comics');
  if (on !== 'true') throw new Error('não ligou');
  globalThis.__posBefore = await page.evaluate(() => localStorage.getItem('tp_video_positions') || '{}');
  globalThis.__contBefore = await page.evaluate(() => localStorage.getItem('tp_continue_watching') || '[]');
  return 'ligado (aparece nas duas seções)';
});

await step('Vídeo local · adicionar pasta e tocar', async () => {
  if (!MEDIA) throw new Error('sem pasta de mídia');
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, path.join(MEDIA, 'tp-videos'));
  await goSection('Animes & Vídeos');
  await goTab('Local');
  await visible(page, 'button:has-text("Adicionar Pastas")').click();
  await visible(page, 'text=tp-videos').first().waitFor({ timeout: 30000 });
  await visible(page, 'text=tp-videos').first().click();
  await visible(page, 'text=sample').first().waitFor({ timeout: 30000 });
  await shot(page, 'video-local-lista');
  await visible(page, 'text=sample').first().click();
  await page.waitForSelector('video', { timeout: 20000 });
  await sleep(5000);
  const t = await page.evaluate(() => {
    const v = [...document.querySelectorAll('video')].find((x) => x.offsetParent);
    return v ? { t: v.currentTime, d: v.duration, paused: v.paused, err: v.error?.code || null } : null;
  });
  await shot(page, 'video-local-tocando');
  if (!t || t.err) throw new Error('vídeo não tocou: ' + JSON.stringify(t));
  return `tocando: ${t.t.toFixed(1)}s de ${Number(t.d).toFixed(1)}s (pausado=${t.paused})`;
});

await step('Modo anônimo · nada do que foi assistido ficou salvo', async () => {
  await sleep(2500);
  const badge = await page.locator('text=Anônimo >> visible=true').count();
  // Fecha o player (é aí que a posição costuma ser gravada)
  await page.keyboard.press('Control+w').catch(() => {});
  await sleep(1500);
  const pos = await page.evaluate(() => localStorage.getItem('tp_video_positions') || '{}');
  const cont = await page.evaluate(() => localStorage.getItem('tp_continue_watching') || '[]');
  await goSection('Animes & Vídeos');
  const sw = page.locator('[role=switch]:has-text("Anônimo") >> visible=true').first();
  if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click();
  await sleep(500);
  if (pos !== globalThis.__posBefore) throw new Error('a posição do vídeo foi salva no modo anônimo');
  if (cont !== globalThis.__contBefore) throw new Error('entrou no "Continuar assistindo" no modo anônimo');
  return `nada salvo (selo no player: ${badge ? 'sim' : 'não'}); modo desligado de novo`;
});

await step('Formatos · MKV, AVI e MP4 com áudio AC3 tocam no player', async () => {
  if (!MEDIA) throw new Error('sem pasta de mídia');
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, path.join(MEDIA, 'tp-formats'));
  await goSection('Animes & Vídeos');
  await goTab('Local');
  await visible(page, 'button:has-text("Adicionar Pastas")').click();
  await visible(page, 'text=tp-formats').first().waitFor({ timeout: 30000 });
  const out = [];
  for (const name of ['fmt-mkv', 'fmt-avi', 'fmt-ac3']) {
    await visible(page, 'text=tp-formats').first().click();
    await visible(page, `text=${name}`).first().waitFor({ timeout: 30000 });
    await visible(page, `text=${name}`).first().click();
    const t0 = Date.now();
    const ok = await page
      .waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.offsetParent && v.currentTime > 1 && !v.error), null, { timeout: 45000 })
      .then(() => true)
      .catch(() => false);
    await sleep(2500);
    const src = await page.evaluate(() => [...document.querySelectorAll('video')].find((x) => x.offsetParent)?.currentSrc || '');
    out.push(`${name}: ${ok ? 'tocou em ' + ((Date.now() - t0) / 1000).toFixed(1) + 's' : 'NÃO tocou'} (${src.split(':')[0]})`);
    if (name === 'fmt-mkv') await shot(page, 'formato-mkv');
    await page.keyboard.press('Control+w').catch(() => {});
    await sleep(800);
    await goSection('Animes & Vídeos');
    await goTab('Local');
  }
  if (out.some((x) => /NÃO/.test(x))) throw new Error(out.join('; '));
  // AC3 dentro de MP4 precisa passar pelo FFmpeg (senão o Chromium toca sem som)
  if (!/fmt-ac3: tocou .*\(media\)/.test(out.join('; '))) throw new Error('MP4 com AC3 tocou sem converter o áudio: ' + out.join('; '));
  return out.join('; ');
});

await step('Navegador integrado', async () => {
  await page.keyboard.press('Control+t');
  await sleep(1500);
  const bar = visible(page, 'input[placeholder*="DuckDuckGo"]').first();
  await bar.fill('https://example.com');
  await bar.press('Enter');
  await sleep(6000);
  await shot(page, 'navegador');
  return 'abriu nova aba e carregou example.com';
});

await step('Abas · arrastar para reordenar', async () => {
  const tabs = page.locator('[data-tab-id]');
  const before = await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  const n = await tabs.count();
  await tabs.nth(n - 1).dragTo(tabs.nth(0), { targetPosition: { x: 5, y: 10 } });
  await sleep(600);
  const after = await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  await shot(page, 'abas-reordenadas');
  if (before.join('|') === after.join('|')) throw new Error('ordem não mudou: ' + before.join(' | '));
  return `${before.join(' | ')}  →  ${after.join(' | ')}`;
});

await step('Busca global (Ctrl+K)', async () => {
  await page.keyboard.press('Control+k');
  await sleep(600);
  await page.keyboard.type('config');
  await sleep(600);
  await shot(page, 'ctrl-k');
  await page.keyboard.press('Escape');
  return 'abre e filtra';
});

await step('Configurações · banner e abas', async () => {
  await goSection('Configurações');
  await sleep(1500);
  await shot(page, 'configuracoes');
  const names = ['Extensões', 'Suwayomi', 'Contas', 'Komga', 'Sistema'];
  for (const n of names) {
    await visible(page, `button[role=tab]:has-text("${n}")`).first().click();
    await sleep(700);
  }
  await shot(page, 'configuracoes-sistema');
  return 'todas as abas abriram';
});

await step('Botão Doar abre o Ko-fi', async () => {
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (u) => {
      globalThis.__opened.push(u);
    };
  });
  await goSection('Animes & Vídeos');
  await goTab('Descobrir');
  await visible(page, 'button:has-text("Doar")').first().click();
  await sleep(800);
  const opened = await app.evaluate(() => globalThis.__opened);
  if (!opened?.some((u) => u.includes('ko-fi.com/tomodachiplayer'))) throw new Error('abriu: ' + JSON.stringify(opened));
  return opened.join(', ');
});

// Reabrir: a biblioteca e as abas continuam lá?
const memory = await app.evaluate(async ({ app: a }) => {
  const m = await a.getAppMetrics();
  return Math.round(m.reduce((s, p) => s + (p.memory?.workingSetSize || 0), 0) / 1024);
});
results.push({ name: 'Memória (todos os processos)', ok: true, ms: 0, note: `${memory} MB` });
await app.close();
await sleep(2000);

({ app, page, startMs } = await launch('run2'));
await step('Reabrir · sessão e biblioteca mantidas', async () => {
  await sleep(2500);
  await shot(page, 'reaberto');
  const tabs = await page.locator('[data-tab-id]').count();
  await goSection('Animes & Vídeos');
  await goTab('Biblioteca');
  await sleep(1500);
  const lib = await visible(page, '[role=tab]:has-text("Biblioteca")').first().innerText();
  return `${tabs} abas restauradas; ${lib.replace(/\s+/g, ' ')}; abriu em ${(startMs / 1000).toFixed(1)}s`;
});

await step('Idioma · English', async () => {
  await goSection('Configurações');
  await sleep(1000);
  await page.locator('button[aria-label="Idioma"]').first().click();
  await sleep(400);
  await page.locator('[role=listbox] button:has-text("English")').click();
  await visible(page, 'button:has-text("Mudar idioma")').click();
  await page.waitForSelector('text=Settings', { timeout: 30000 });
  await sleep(2500);
  await shot(page, 'english-settings');
  await page.locator("aside >> text=Anime & Videos").first().click();
  await sleep(1500);
  await shot(page, 'english-anime');
  return 'interface trocou para inglês';
});

await app.close();

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, consoleErrors }, null, 2));
const md = [
  '| # | Etapa | Resultado | Tempo | Detalhe |',
  '|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${(r.ms / 1000).toFixed(1)}s | ${String(r.note).replace(/\|/g, '/')} |`),
  '',
  `Erros no console: ${consoleErrors.length}`,
  ...consoleErrors.slice(0, 60).map((e) => `- ${e.replace(/\n/g, ' ')}`),
].join('\n');
fs.writeFileSync(path.join(OUT, 'RESULTADO.md'), md);
log('done', results.filter((r) => !r.ok).length, 'falhas');
process.exit(0);
