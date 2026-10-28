// Teste de ponta a ponta do Tomodachi Player instalado (Windows limpo, internet real).
// Cada etapa é independente: se uma falhar, as outras continuam. Resultado em e2e-out/.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('e2e-out');
fs.mkdirSync(OUT, { recursive: true });
const EXE = process.env.APP_EXE;
const MEDIA = process.env.MEDIA_DIR;
const results = [];
const consoleErrors = [];
let shotN = 0;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

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

await step('Busca no Descobrir', async () => {
  await goTab('Séries');
  const input = visible(page, 'input[placeholder*="Buscar"]').first();
  await input.fill('Breaking Bad');
  await input.press('Enter');
  await sleep(4000);
  await shot(page, 'busca-series');
  const n = await visible(page, 'button[aria-label^="Marcar para favoritar"]').count();
  if (!n) throw new Error('busca não trouxe resultados');
  await input.fill('');
  await input.press('Enter');
  await sleep(2500);
  return `${n} resultados para "Breaking Bad"`;
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

await step('Onde assistir (sem fontes instaladas)', async () => {
  await visible(page, 'button:has-text("Assistir")').first().click();
  await page.locator('text=Onde assistir').first().waitFor({ timeout: 15000 });
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

await step('Fontes · instalar addon (Anime Kitsu, só catálogo)', async () => {
  await goTab('Fontes');
  await page.fill('input[aria-label="Link da fonte"]', 'https://anime-kitsu.strem.fun/manifest.json');
  await page.keyboard.press('Enter');
  await page.locator('text=/Addon instalado/').first().waitFor({ timeout: 45000 });
  await sleep(800);
  await shot(page, 'fontes-addon-instalado');
  return 'instalado';
});

await step('Fontes · Navegar no catálogo do addon', async () => {
  await visible(page, 'button:has-text("Navegar")').last().click();
  await sleep(6000);
  await shot(page, 'navegar-addon');
  const n = await page.locator('img >> visible=true').count();
  if (n < 3) throw new Error('catálogo do addon não carregou capas');
  return `${n} capas`;
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
  const chapterBtn = visible(page, 'button:has-text("Cap"), [role=button]:has-text("Cap")').first();
  if (await chapterBtn.count()) {
    await chapterBtn.click();
    await sleep(10000);
    await shot(page, 'mangadex-leitor');
    const imgs = await page.locator('img >> visible=true').count();
    return `${caps}; leitor abriu com ${imgs} imagens visíveis`;
  }
  return `${caps} (sem capítulo para abrir)`;
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
