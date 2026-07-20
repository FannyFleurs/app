'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { formatEUR } from '@/lib/services/money';
import { useBrand } from '@/components/BrandMark';
import LabelPrintModal from '@/app/(app)/products/LabelPrintModal';
import type { LabelProduct } from '@/lib/services/label-print';

interface Product extends LabelProduct {
  id: string;
}
interface Station { id: string; store_id: string; store_name: string; name: string }

export default function PrintLabelApp({ userName }: { userName: string }) {
  const brand = useBrand();
  const [station, setStation] = useState<Station | null | undefined>(undefined); // undefined = en cours
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [binding, setBinding] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 1) Résolution de la station (PDA ↔ boutique) via l'appareil.
  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      const r = await fetch(`/api/label-stations/mine?device_id=${encodeURIComponent(deviceId)}`);
      const st = r.ok ? ((await r.json()).station as Station | null) : null;
      if (st) { setStation(st); return; }
      // Non rattaché : on charge les boutiques accessibles pour le choix.
      const me = await fetch('/api/me');
      const accessible = me.ok ? (((await me.json()).stores ?? []) as { id: string; name: string }[]) : [];
      setStores(accessible);
      // Une seule boutique accessible → rattachement automatique.
      if (accessible.length === 1) { await bind(accessible[0]!.id); return; }
      setStation(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bind(storeId: string) {
    setBinding(true);
    const deviceId = getOrCreateDeviceId();
    const r = await fetch('/api/label-stations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, store_id: storeId }),
    });
    setBinding(false);
    if (r.ok) {
      const j = await r.json();
      setStation({ id: j.id, store_id: storeId, store_name: j.store_name, name: `PDA ${j.store_name}` });
    }
  }

  // 2) Chargement du catalogue de LA boutique du PDA (filtrage strict serveur).
  useEffect(() => {
    if (!station) return;
    setLoading(true);
    void (async () => {
      const r = await fetch(`/api/products?active=true&store_id=${encodeURIComponent(station.store_id)}`);
      if (r.ok) {
        const j = await r.json();
        setProducts((j.products as Array<Record<string, unknown>>).map((p) => ({
          id: String(p.id),
          name: String(p.name),
          sku: (p.sku as string) ?? null,
          barcode: (p.barcode as string) ?? null,
          sale_price_ttc: Number(p.sale_price_ttc),
          discount_type: (p.discount_type as 'percent' | 'amount' | null) ?? null,
          discount_value: p.discount_value != null ? Number(p.discount_value) : null,
        })));
      }
      setLoading(false);
    })();
  }, [station]);

  // Garde le focus sur la recherche : le scanner PDA « tape » le code + Entrée.
  useEffect(() => {
    if (station && !selected) searchRef.current?.focus();
  }, [station, selected, loading]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.barcode?.toLowerCase().includes(s) ?? false),
    );
  }, [products, q]);

  function onSubmit() {
    const s = q.trim();
    if (!s) return;
    const exact = products.find((p) => p.barcode === s || p.sku === s || p.barcode === s.toUpperCase());
    if (exact) { openProduct(exact); return; }
    if (filtered.length === 1) { openProduct(filtered[0]!); return; }
  }

  function openProduct(p: Product) { setSelected(p); setQ(''); }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.assign('/login');
  }

  // ---- Écran de choix de boutique (PDA non encore rattaché) ----
  if (station === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg p-6">
        <div className="card w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={brand.brand_name} className="h-9 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
                {(brand.brand_name || 'H').charAt(0)}
              </span>
            )}
            <div className="text-sm font-semibold">Station d&apos;étiquettes</div>
          </div>
          <h1 className="text-lg font-semibold">Choisir la boutique de ce PDA</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Ce terminal n&apos;affichera que les articles de la boutique choisie.
          </p>
          <div className="mt-4 space-y-2">
            {stores.length === 0 ? (
              <p className="text-sm text-ink-soft">Aucune boutique accessible avec ce compte.</p>
            ) : stores.map((s) => (
              <button key={s.id} disabled={binding} onClick={() => void bind(s.id)}
                      className="w-full btn-soft h-12 justify-between">
                <span>{s.name}</span>
                <span className="text-ink-soft">→</span>
              </button>
            ))}
          </div>
          <button onClick={() => void logout()} className="mt-4 text-sm text-ink-soft hover:text-ink">
            Quitter
          </button>
        </div>
      </div>
    );
  }

  if (station === undefined) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink-soft">Chargement…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink">
      {/* En-tête */}
      <header className="shrink-0 h-16 border-b border-border bg-surface flex items-center gap-3 px-4">
        {brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo_url} alt={brand.brand_name} className="h-9 w-auto max-w-[150px] object-contain" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
            {(brand.brand_name || 'H').charAt(0)}
          </span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight truncate">Étiquettes — {station.store_name}</div>
          <div className="text-xs text-ink-soft truncate">{userName}</div>
        </div>
        <button onClick={() => void logout()}
                className="ml-auto text-sm text-ink-soft hover:text-ink px-3 py-2 rounded-lg hover:bg-gray-100">
          Quitter
        </button>
      </header>

      {/* Recherche / scan */}
      <div className="shrink-0 p-3 border-b border-border bg-surface">
        <input
          ref={searchRef}
          className="input h-14 text-lg w-full"
          placeholder="Scanner un code-barres ou rechercher un article…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } }}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      {/* Liste des articles */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-sm text-ink-soft">Chargement du catalogue…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft">Aucun article trouvé.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => openProduct(p)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-100 hover:bg-gray-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-ink-soft truncate">
                      {p.barcode ? `⛏ ${p.barcode}` : '— pas de code-barres —'}
                      {p.sku ? ` · ${p.sku}` : ''}
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums whitespace-nowrap">
                    {formatEUR(p.sale_price_ttc)}
                  </div>
                  <span className="text-accent-deep text-sm shrink-0">🏷</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <LabelPrintModal product={selected} storeId={station.store_id} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
