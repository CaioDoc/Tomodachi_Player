// scripts/build-torrent.cjs
// Compila o motor de torrent (electron/torrent/engine.ts) para dist-electron/torrent-engine.js.
// Nunca quebra o build do app: se não der para empacotar o WebTorrent, tenta deixá-lo
// como dependência externa e, em último caso, gera um "stub" que só avisa que o motor
// não está disponível (o resto do app continua funcionando normalmente).
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const entry = path.join(root, 'electron', 'torrent', 'engine.ts');
const outfile = path.join(root, 'dist-electron', 'torrent-engine.js');
const NATIVE = ['electron', 'utp-native', 'bufferutil', 'utf-8-validate', 'wrtc', 'node-datachannel', 'fsevents'];

function stub(reason) {
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(
    outfile,
    `// stub: motor de torrent indisponível\n` +
      `try { process.parentPort && process.parentPort.postMessage({ type: 'unavailable', error: ${JSON.stringify(String(reason).slice(0, 400))} }); } catch (e) {}\n` +
      `setTimeout(() => process.exit(0), 200);\n`
  );
  console.warn('[torrent] motor de torrent não compilado (' + reason + '). Torrents ficarão indisponíveis.');
}

let esbuild;
try {
  esbuild = require('esbuild');
} catch (e) {
  stub('esbuild ausente');
  process.exit(0);
}

let hasWebTorrent = true;
try {
  require.resolve('webtorrent', { paths: [root] });
} catch {
  hasWebTorrent = false;
}

const base = { entryPoints: [entry], outfile, platform: 'node', target: 'node20', format: 'cjs', bundle: true, logLevel: 'error', absWorkingDir: root };

(async () => {
  if (!hasWebTorrent) {
    stub('pacote webtorrent não instalado — rode "npm install"');
    return;
  }
  try {
    await esbuild.build({ ...base, external: NATIVE, mainFields: ['main', 'module'] });
    console.log('[torrent] motor de torrent compilado (empacotado).');
    return;
  } catch (e) {
    console.warn('[torrent] empacotamento completo falhou, tentando com dependências externas…');
  }
  try {
    await esbuild.build({ ...base, packages: 'external' });
    console.log('[torrent] motor de torrent compilado (dependências externas).');
  } catch (e) {
    stub(e && e.message ? e.message.split('\n')[0] : 'erro de build');
  }
})().catch((e) => stub(String(e)));
