'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BrowserMultiFormatReader,
} from '@zxing/browser';
import {
  BarcodeFormat,
  DecodeHintType,
  type Result,
} from '@zxing/library';

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
 * Stratégie :
 *  1) Si l'API native `BarcodeDetector` est dispo (iOS 17+, Chrome / Edge
 *     Android), on l'utilise — c'est la plus rapide et la moins gourmande
 *     en CPU.
 *  2) Sinon (Safari iOS < 17, Firefox Android, anciens navigateurs), on
 *     bascule sur ZXing en pur JavaScript : marche dans tous les
 *     navigateurs modernes qui exposent `getUserMedia`.
 *
 * Pré-requis : la page DOIT être servie en HTTPS (ou localhost) pour que
 * le navigateur autorise l'accès caméra.
 */
export default function BarcodeScannerModal({ onClose, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [engine, setEngine] = useState<'native' | 'zxing' | 'loading'>('loading');

  // Garde-fou anti-doublon : un même code détecté plusieurs fois en moins
  // de 1.5 s ne déclenche qu'une seule notification onScan.
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
      // Vérification HTTPS (le scan ne marche pas sur HTTP sauf localhost)
      if (typeof window !== 'undefined'
          && window.location.protocol !== 'https:'
          && window.location.hostname !== 'localhost'
          && !window.location.hostname.startsWith('127.0.0.1')) {
        setError('Le scan caméra requiert HTTPS. Servez l\'application en HTTPS pour autoriser l\'accès caméra.');
        setEngine('zxing');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Ce navigateur ne supporte pas l\'accès caméra. Saisissez le code à la main.');
        setEngine('zxing');
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
        setEngine('zxing');
        return;
      }

      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // playsInline est crucial sur iOS — sinon la vidéo passe en plein écran
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
          } catch { /* ignore frame errors */ }
          rafId = window.requestAnimationFrame(() => void loop());
        }
        void loop();
      } else {
        // Fallback ZXing en pur JS
        setEngine('zxing');
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.ITF,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        try {
          zxingControls = await reader.decodeFromVideoElement(
            video,
            (result: Result | undefined) => {
              if (result) report(result.getText());
            },
          );
        } catch (e) {
          setError('Impossible d\'initialiser le scanner : ' + ((e as Error).message ?? ''));
        }
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
    engine === 'native' ? 'Scan natif'
    : engine === 'zxing' ? 'Scan ZXing'
    : 'Démarrage…';

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
          {!error && (
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
                <div className="text-3xl mb-3">📷</div>
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
            autoFocus={!!error}
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
