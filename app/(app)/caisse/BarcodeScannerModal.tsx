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
 * Scanner code-barres / QR mobile.
 *
 * Compatibilité :
 *  - Chrome / Edge Android → API native BarcodeDetector (rapide, légère)
 *  - iOS Safari / Chrome iOS / Firefox → fallback ZXing en pur JS
 *  - Tous les autres → saisie manuelle dans le champ texte
 *
 * Pré-requis : HTTPS pour autoriser getUserMedia (auto sur Vercel).
 */
export default function BarcodeScannerModal({ onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [engine, setEngine] = useState<'loading' | 'native' | 'zxing' | 'manual'>('loading');

  // Anti-doublon
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
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      // Vérif HTTPS
      if (typeof window !== 'undefined'
          && window.location.protocol !== 'https:'
          && window.location.hostname !== 'localhost'
          && !window.location.hostname.startsWith('127.0.0.1')) {
        setError('Le scan caméra requiert HTTPS.');
        setEngine('manual');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Ce navigateur ne supporte pas l\'accès caméra.');
        setEngine('manual');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError'
          ? 'Accès caméra refusé.'
          : 'Caméra indisponible.');
        setEngine('manual');
        return;
      }

      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => undefined);

      const NativeCtor =
        (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

      if (NativeCtor) {
        setEngine('native');
        const detector = new NativeCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix', 'itf'],
        });
        async function loop() {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length) report(codes[0]!.rawValue);
          } catch { /* ignore */ }
          rafId = window.requestAnimationFrame(() => void loop());
        }
        void loop();
        return;
      }

      // Fallback ZXing (chargement dynamique pour ne pas pénaliser desktop)
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        setEngine('zxing');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        zxingControls = await reader.decodeFromVideoElement(
          video,
          (result) => { if (result) report(result.getText()); },
        );
      } catch (e) {
        setError('Initialisation scanner échouée : ' + ((e as Error).message ?? ''));
        setEngine('manual');
      }
    }
    void start();

    return () => {
      stopped = true;
      if (rafId) cancelAnimationFrame(rafId);
      try { zxingControls?.stop(); } catch {}
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engineLabel =
    engine === 'loading' ? 'Démarrage…'
    : engine === 'native' ? 'Scan natif'
    : engine === 'zxing' ? 'Scan ZXing'
    : 'Saisie manuelle';

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden bg-black aspect-[3/4] relative">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
          {/* Cadre de mire */}
          {!error && engine !== 'manual' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 aspect-[4/3] border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {/* Badge moteur */}
          <div className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5">
            {engineLabel}
          </div>
          {error && (
            <div className="absolute inset-0 grid place-items-center bg-black/80 text-white text-center p-6 text-sm">
              <div>
                <div className="font-medium mb-2">{error}</div>
                <div className="text-xs opacity-80">Saisissez le code à la main ci-dessous.</div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 text-white text-sm">
          {lastCode ? <>Détecté : <span className="font-mono">{lastCode}</span></> : 'Visez un code-barres ou QR…'}
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
            autoFocus={engine === 'manual'}
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
