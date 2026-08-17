/**
 * Capture d'écran d'une demande d'assistance, côté navigateur.
 *
 * Deux chemins, dans cet ordre :
 *   1. `getDisplayMedia` — le navigateur propose de partager l'onglet ou
 *      l'écran, on en prend une image. C'est la voie la plus simple pour le
 *      commerçant : rien à enregistrer, rien à retrouver dans ses fichiers.
 *      Absente d'une bonne partie des navigateurs de tablette.
 *   2. un fichier choisi (ou collé) par le commerçant : la capture qu'il a
 *      faite avec les boutons de sa tablette.
 *
 * Dans les deux cas l'image est réduite et compressée : elle voyage dans le
 * corps JSON de la demande et finit dans une ligne de base, pas dans un
 * service de fichiers.
 */

const MAX_SIDE = 1400;
const QUALITY = 0.72;

export function canCaptureScreen(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

/** Réduit une image déjà chargée en data URL JPEG. */
function drawToDataUrl(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_INDISPONIBLE');
  // Fond blanc : un PNG transparent deviendrait noir en JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', QUALITY);
}

/** Compresse un fichier image choisi ou collé par l'utilisateur. */
export function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        resolve(drawToDataUrl(img, img.width, img.height));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_ILLISIBLE'));
    };
    img.src = url;
  });
}

/**
 * Demande le partage d'écran, prend une image de la première frame, puis
 * coupe le flux immédiatement — on ne garde jamais le partage ouvert.
 */
export async function captureScreen(): Promise<string> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Une frame doit être arrivée avant de dessiner, sinon l'image est vide.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const shot = drawToDataUrl(video, w, h);
    video.pause();
    video.srcObject = null;
    return shot;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}
