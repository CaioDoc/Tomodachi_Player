// Testa a atualização automática: o app antigo (já instalado) precisa achar a versão nova,
// baixar sozinho e, ao pedir "Reiniciar e atualizar", instalar e abrir de novo.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('update-out');
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => {
  const line = `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}`;
  console.log(line);
  fs.appendFileSync(path.join(OUT, 'log.txt'), line + '\n');
};

const app = await electron.launch({ executablePath: process.env.APP_EXE, timeout: 90000 });
const page = await app.firstWindow({ timeout: 90000 });
await page.waitForSelector('text=Tomodachi Player', { timeout: 60000 });
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

let last = '';
let state = null;
const t0 = Date.now();
while (Date.now() - t0 < 8 * 60 * 1000) {
  state = await page.evaluate(() => window.electronAPI?.updaterGetState?.()).catch(() => null);
  const s = JSON.stringify({ status: state?.status, mode: state?.mode, auto: state?.auto, current: state?.current, version: state?.version, percent: state?.percent, error: state?.error });
  if (s !== last) {
    log('estado', s);
    last = s;
  }
  if (state?.status === 'downloaded' || state?.status === 'error' || (state?.status === 'up-to-date' && Date.now() - t0 > 60000)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
await page.screenshot({ path: path.join(OUT, '1-aviso.png') }).catch(() => {});
await page.locator('aside >> text=Configurações').first().click().catch(() => {});
await page.waitForTimeout(800);
await page.locator('button[role=tab]:has-text("Sistema") >> visible=true').first().click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, '2-configuracoes.png') }).catch(() => {});

if (state?.status === 'downloaded') {
  log('pedindo "Reiniciar e atualizar"');
  await page.evaluate(() => window.electronAPI?.updaterInstall?.()).catch(() => {});
  await app.waitForEvent('close', { timeout: 60000 }).catch(() => log('o app não fechou em 60 s'));
  log('app fechou para instalar');
} else {
  log('a atualização não ficou pronta:', JSON.stringify(state));
  await app.close().catch(() => {});
}
fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(state, null, 2));
