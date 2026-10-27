const fs = require('fs');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');

function copyFfmpeg() {
  const binaryPath = ffmpegStatic;
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    console.warn('[copy-ffmpeg] ffmpeg binary not found in ffmpeg-static');
    return;
  }

  const targetDir = path.join(__dirname, '..', 'dist-electron', 'bin');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const targetFile = path.join(targetDir, path.basename(binaryPath));
  try {
    fs.copyFileSync(binaryPath, targetFile);
    console.log(`[copy-ffmpeg] Copied ffmpeg binary to: ${targetFile}`);
  } catch (err) {
    console.error('[copy-ffmpeg] Failed to copy ffmpeg binary:', err);
  }
}

copyFfmpeg();
