const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');

const VITE_PORT = 5173;
const VITE_URL = `http://localhost:${VITE_PORT}`;

function checkViteReady() {
  return new Promise((resolve) => {
    const req = http.get(VITE_URL, (res) => {
      if (res.statusCode === 200 || res.statusCode === 304) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function start() {
  console.log('[Dev] Waiting for Vite server at', VITE_URL, '...');
  let ready = false;
  let attempts = 0;
  while (!ready && attempts < 100) {
    ready = await checkViteReady();
    if (!ready) {
      await new Promise((r) => setTimeout(r, 400));
      attempts++;
    }
  }

  if (!ready) {
    console.error('[Dev] Vite server timed out.');
    process.exit(1);
  }

  console.log('[Dev] Vite server ready! Building Electron main & preload...');
  try {
    execSync('npm run electron:build', { stdio: 'inherit' });
  } catch (err) {
    console.error('[Dev] Electron build failed:', err);
    process.exit(1);
  }

  console.log('[Dev] Launching Electron...');
  const electronBin = require('electron');
  const child = spawn(electronBin, ['.'], {
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: VITE_URL }
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

start();
