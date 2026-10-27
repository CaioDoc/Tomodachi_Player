import { t } from '../i18n';
/**
 * Extrai frame de um elemento <video> já renderizado em tela.
 * Retorna uma string base64 no formato data:image/jpeg;base64,...
 */
export function captureFrameFromElement(videoElement: HTMLVideoElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 1280;
  canvas.height = videoElement.videoHeight || 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(t('Falha ao criar contexto 2D no Canvas'));
  }

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Cria um vídeo temporário fora da tela, avança para seekTimeSec e renderiza o frame em canvas.
 */
export function captureVideoFrame(videoFileUrl: string, seekTimeSec: number = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoFileUrl;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;

    let timeout = setTimeout(() => {
      video.remove();
      reject(new Error(t('Tempo esgotado ao tentar capturar frame do vídeo')));
    }, 10000);

    video.onloadeddata = () => {
      const targetTime = Math.min(seekTimeSec, video.duration ? video.duration / 2 : seekTimeSec);
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        } else {
          reject(new Error(t('Erro ao criar contexto 2D do Canvas')));
        }
      } catch (err) {
        reject(err);
      } finally {
        video.src = '';
        video.load();
        video.remove();
      }
    };

    video.onerror = (e) => {
      clearTimeout(timeout);
      video.remove();
      reject(new Error(t('Falha ao carregar vídeo para captura de frame: {error}', { error: String(e) })));
    };
  });
}
