'use client';

import { useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { useBrand } from '@/components/BrandMark';
import BarcodeScannerModal from '@/app/(app)/caisse/BarcodeScannerModal';

/**
 * Écran d'appairage du PDA (app dédiée). Deux moyens :
 *  - saisir le code d'appairage généré en BO,
 *  - scanner le QR d'appairage (caméra).
 * L'appairage ouvre une session longue durée rattachée à la boutique.
 */
export default function PdaPairing() {
  const brand = useBrand();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState(false);

  async function pair(raw: string) {
    const c = raw.trim();
    if (!c) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/pda/pair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: c, device_id: getOrCreateDeviceId() }),
      });
      if (r.ok) { window.location.assign('/pda'); return; }
      setError(r.status === 404 ? 'Code d’appairage invalide.' : 'Échec de l’appairage.');
    } catch { setError('Réseau indisponible.'); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-bg p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={brand.brand_name} className="h-9 w-auto max-w-[150px] object-contain" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
              {(brand.brand_name || 'H').charAt(0)}
            </span>
          )}
          <div className="text-sm font-semibold text-ink-soft">PDA</div>
        </div>

        <h1 className="text-lg font-semibold">Appairer ce PDA</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Saisissez le code d&apos;appairage de la boutique (Back-office → Réglages →
          PDA étiquettes), ou scannez le QR.
        </p>

        <label className="block mt-4 text-sm">
          <span className="text-ink-soft">Code d&apos;appairage</span>
          <input
            className="input h-14 w-full mt-1 text-center text-2xl font-mono tracking-widest uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') void pair(code); }}
            placeholder="XXXX-XXXX"
            autoFocus autoComplete="off"
          />
        </label>

        {error && <p className="mt-2 text-sm text-danger">{error}</p>}

        <button onClick={() => void pair(code)} disabled={busy || !code.trim()}
                className="btn-primary w-full h-12 mt-4">
          {busy ? 'Appairage…' : 'Appairer'}
        </button>
        <button onClick={() => setScan(true)} disabled={busy}
                className="btn-soft w-full h-12 mt-2">
          📷 Scanner le QR d&apos;appairage
        </button>
      </div>

      {scan && (
        <BarcodeScannerModal
          onClose={() => setScan(false)}
          onScan={(v) => { setScan(false); setCode(v.trim().toUpperCase()); void pair(v); }}
        />
      )}
    </div>
  );
}
