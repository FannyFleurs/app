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
 * Pont Capacitor natif (app iOS/Android empaquetée). L'app web distante tourne
 * dans une WKWebView : le natif injecte `window.Capacitor`, on y accède comme
 * pour l'imprimante (HelloPosPrinter) — sans importer @capacitor/core dans le
 * bundle web, donc AUCUN impact sur la PWA / le navigateur.
 *
 * Plugin natif : @capacitor-mlkit/barcode-scanning (jsName « BarcodeScanner »),
 * installé côté projet Capacitor iOS. Sa méthode scan() ouvre l'UI caméra
 * native clé en main et renvoie les codes détectés.
 */
interface NativeBarcode { rawValue?: string; displayValue?: string; format?: string }
interface NativeBarcodeScannerPlugin {
  isSupported: () => Promise<{ supported: boolean }>;
  checkPermissions: () => Promise<{ camera: string }>;
  requestPermissions: () => Promise<{ camera: string }>;
  scan: (options?: { formats?: string[] }) => Promise<{ barcodes: NativeBarcode[] }>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { BarcodeScanner?: NativeBarcodeScannerPlugin };
}
function getCapacitor(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor ?? null;
}
/** Renvoie le plugin natif SEULEMENT dans une app Capacitor native, sinon null. */
function nativeBarcodePlugin(): NativeBarcodeScannerPlugin | null {
  const cap = getCapacitor();
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.BarcodeScanner ?? null;
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
  const [engine, setEngine] = useState<'loading' | 'native' | 'zxing' | 'manual' | 'native-cap'>(
    // App Capacitor native : on part directement sur le panneau natif (évite de
    // monter le <video> web une fraction de seconde). Navigateur/PWA : 'loading'.
    () => (nativeBarcodePlugin() ? 'native-cap' : 'loading'),
  );
  // Scan natif Capacitor en cours (UI caméra native affichée par-dessus).
  const [nativeScanning, setNativeScanning] = useState(false);
  const nativePluginRef = useRef<NativeBarcodeScannerPlugin | null>(null);

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

  /**
   * Ouvre le scanner caméra NATIF (app Capacitor). Un seul scan par appel :
   * on renvoie le code au même traitement (report → onScan) puis on laisse la
   * modale décider (le parcours caisse la ferme via onScan, comme pour le web).
   * Toute erreur / annulation retombe proprement sur la saisie manuelle.
   */
  async function runNativeScan() {
    const plugin = nativePluginRef.current;
    if (!plugin || nativeScanning) return;
    setError(null);
    setNativeScanning(true);
    try {
      let perm = await plugin.checkPermissions();
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        perm = await plugin.requestPermissions();
      }
      if (perm.camera !== 'granted' && perm.camera !== 'limited') {
        setError('Accès caméra refusé. Autorisez la caméra dans Réglages, ou saisissez le code.');
        return;
      }
      const res = await plugin.scan();
      const b = res?.barcodes?.[0];
      const code = (b?.rawValue ?? b?.displayValue ?? '').trim();
      if (code) report(code);
      // Code vide = scan annulé par l'utilisateur : on ne fait rien (retour modale).
    } catch {
      // Plugin indisponible / caméra HS / scan interrompu : jamais de crash.
      setError('Scanner natif indisponible. Saisissez le code à la main.');
    } finally {
      setNativeScanning(false);
    }
  }

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let zxingControls: { stop: () => void } | null = null;

    async function start() {
      // Chemin NATIF (app Capacitor iOS/Android) : caméra native via plugin.
      // Sur navigateur / PWA, nativeBarcodePlugin() renvoie null → on garde
      // strictement le chemin web existant ci-dessous, inchangé.
      const nativePlugin = nativeBarcodePlugin();
      if (nativePlugin) {
        nativePluginRef.current = nativePlugin;
        try {
          const sup = await nativePlugin.isSupported();
          if (!sup?.supported) {
            setError('Scanner indisponible sur cet appareil. Saisissez le code à la main.');
            setEngine('manual');
            return;
          }
        } catch {
          setError('Scanner natif indisponible. Saisissez le code à la main.');
          setEngine('manual');
          return;
        }
        if (stopped) return;
        setEngine('native-cap');
        // Ouverture immédiate du scanner natif (le parcours reste : clic sur le
        // bouton caméra → scanner s'ouvre). Un bouton permet de rescanner.
        void runNativeScan();
        return;
      }

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
    : engine === 'native-cap' ? 'Caméra native'
    : engine === 'zxing' ? 'Scan ZXing'
    : 'Saisie manuelle';

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 grid place-items-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden bg-black aspect-[3/4] relative">
          {/* App native (Capacitor) : la caméra est ouverte par le scanner
              natif par-dessus la WebView. On affiche donc un panneau avec un
              bouton pour (re)lancer le scan, au lieu du flux <video> web. */}
          {engine === 'native-cap' ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
              <div className="flex flex-col items-center gap-3">
                {error ? (
                  <div className="text-sm font-medium">{error}</div>
                ) : (
                  <div className="text-sm opacity-80">
                    {nativeScanning ? 'Scanner ouvert…' : 'Prêt à scanner'}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void runNativeScan()}
                  disabled={nativeScanning}
                  className="rounded-xl accent-bar text-white px-5 py-3 text-sm font-semibold disabled:opacity-50"
                >
                  {nativeScanning ? 'Scan en cours…' : (lastCode ? 'Scanner à nouveau' : 'Scanner un code-barres')}
                </button>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
          )}
          {/* Cadre de mire (chemin caméra web uniquement) */}
          {!error && engine !== 'manual' && engine !== 'native-cap' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-3/4 aspect-[4/3] border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {/* Badge moteur */}
          <div className="absolute top-2 right-2 rounded-full bg-black/60 text-white text-[10px] px-2 py-0.5">
            {engineLabel}
          </div>
          {error && engine !== 'native-cap' && (
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
