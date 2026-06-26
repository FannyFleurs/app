'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  onClose: () => void;
  onScan: (code: string) => void;
}

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): { detect: (src: CanvasImageSource) => Promise<DetectedBarcode[]> };
  getSupportedFormats?: () => Promise<string[]>;
}

/**
 * Scanner code-barres / QR en utilisant l'API BarcodeDetector (Chrome / Edge
 * Android / iOS 17+). Fallback : message d'indisponibilité si l'API n'est
 * pas exposée (Safari < 17, Firefox).
 *
 * Stoppe automatiquement la caméra à la fermeture.
 */
export default function BarcodeScannerModal({ onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean>(true);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let rafId = 0;
    let lastReportedAt = 0;

    async function start() {
      const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Ctor) {
        setSupported(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        setError('Caméra inaccessible. Autorisez l\'accès dans les réglages.');
        return;
      }

      const detector = new Ctor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'],
      });

      async function loop() {
        if (stopped || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length) {
            const code = codes[0]!.rawValue.trim();
            const now = Date.now();
            // Anti-doublon : ignore les détections répétées en moins de 1.5 s
            if (code && (code !== lastCode || now - lastReportedAt > 1500)) {
              setLastCode(code);
              lastReportedAt = now;
              navigator.vibrate?.(80);
              onScan(code);
            }
          }
        } catch { /* ignore */ }
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
          {supported ? (
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white p-6 text-center text-sm">
              <div>
                <div className="text-3xl mb-3">📷</div>
                <div className="font-medium mb-1">Scan caméra indisponible sur ce navigateur</div>
                <div className="text-xs opacity-80">
                  Disponible sur iOS 17+, Chrome / Edge Android.
                  Saisissez le code à la main ci-dessous.
                </div>
              </div>
            </div>
          )}
          {/* Cadre de mire */}
          {supported && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 aspect-[4/3] border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-white text-center p-6 text-sm">
              {error}
            </div>
          )}
        </div>
        <div className="mt-3 text-white text-sm">
          {lastCode ? <>Détecté : <span className="font-mono">{lastCode}</span></> : (supported ? 'Visez un code-barres ou QR…' : 'Saisie manuelle')}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = manualCode.trim();
            if (v) onScan(v);
            setManualCode('');
          }}
          className="mt-3 flex items-center gap-2"
        >
          <input
            autoFocus={!supported}
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Code-barres / SKU"
            className="flex-1 rounded-xl bg-white px-3 py-2 text-sm text-ink"
            inputMode="text"
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
