'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onClose: () => void;
  onScan: (code: string) => void;
}

interface DetectedBarcode { rawValue: string; format: string; }
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };
}

/**
 * Scanner code-barres / QR via l'API native `BarcodeDetector`.
 *
 * Compatibilité :
 *  - iOS 17+ (Safari, Chrome iOS)
 *  - Chrome / Edge Android
 *  - Chrome / Edge desktop (rarement utile mais ça marche)
 *
 * Pour les navigateurs sans BarcodeDetector (iOS < 17, Firefox), la modale
 * propose une saisie manuelle directement (utile aussi pour les scanners
 * USB en mode HID qui « tapent » le code dans le champ).
 *
 * Pré-requis : la page doit être servie en HTTPS (ou localhost) — sinon
 * `getUserMedia` est refusé par le navigateur.
 */
export default function BarcodeScannerModal({ onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasDetector, setHasDetector] = useState<boolean>(true);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  // Anti-doublon : un même code détecté plusieurs fois en < 1,5 s ne
  // déclenche qu'un seul onScan.
  const lastReportedRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  function report(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const last = lastReportedRef.current;
    if (code === last.code && now - last.at < 1500) return;
    lastReportedRef.current = { code, at: now };
    setLastCode(code);
    try { navigator.vibrate?.(80); } catch {}
    onScan(code);
  }

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let rafId = 0;

    async function start() {
      // Vérification HTTPS
      if (typeof window !== 'undefined'
          && window.location.protocol !== 'https:'
          && window.location.hostname !== 'localhost'
          && !window.location.hostname.startsWith('127.0.0.1')) {
        setError('Le scan caméra requiert HTTPS. Servez l\'application en HTTPS pour autoriser l\'accès caméra.');
        return;
      }

      const NativeCtor =
        (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!NativeCtor) {
        setHasDetector(false);
        // Pas de scanner caméra dispo : on passe en saisie manuelle uniquement.
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Ce navigateur ne supporte pas l\'accès caméra. Saisissez le code à la main.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        setError(
          (e as Error).name === 'NotAllowedError'
            ? 'Accès caméra refusé. Autorisez la caméra dans les réglages du navigateur.'
            : 'Caméra indisponible : ' + ((e as Error).message ?? 'erreur inconnue'),
        );
        return;
      }

      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => undefined);

      const detector = new NativeCtor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix', 'itf'],
      });

      async function loop() {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length) report(codes[0]!.rawValue);
        } catch { /* ignore frame errors */ }
        rafId = window.requestAnimationFrame(() => void loop());
      }
      void loop();
    }
    void start();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden bg-black aspect-[3/4] relative">
          {hasDetector ? (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white text-center p-6 text-sm">
              <div>
                <div className="text-3xl mb-3">⌨️</div>
                <div className="font-medium mb-2">Scan caméra non supporté</div>
                <div className="text-xs opacity-80">
                  Votre navigateur n&apos;expose pas l&apos;API BarcodeDetector
                  (iOS 17+, Chrome / Edge Android requis).
                  Saisissez le code à la main, ou utilisez un scanner USB.
                </div>
              </div>
            </div>
          )}
          {hasDetector && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 aspect-[4/3] border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 text-white text-center p-6 text-sm">
              <div>
                <div className="text-3xl mb-3">📷</div>
                <div className="font-medium mb-2">{error}</div>
                <div className="text-xs opacity-80">Saisissez le code à la main ci-dessous.</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 text-white text-sm">
          {lastCode ? <>Détecté : <span className="font-mono">{lastCode}</span></> : (hasDetector ? 'Visez un code-barres ou QR…' : 'Saisie manuelle')}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = manualCode.trim();
            if (v) { report(v); setManualCode(''); }
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            autoFocus={!hasDetector || !!error}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Code-barres / SKU"
            className="flex-1 rounded-xl bg-white px-3 py-2 text-sm text-ink"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button
            type="submit"
            disabled={!manualCode.trim()}
            className="rounded-xl accent-bar text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Ajouter
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white text-ink px-4 py-2 text-sm font-semibold"
          >
            Fermer
          </button>
        </form>
      </div>
    </div>
  );
}
