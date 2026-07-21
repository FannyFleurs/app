'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrCreateDeviceId } from '@/lib/device';
import { formatEUR } from '@/lib/services/money';
import { useBrand } from '@/components/BrandMark';
import BarcodeScannerModal from '@/app/(app)/caisse/BarcodeScannerModal';
import ProductFormModal from '@/app/(app)/products/ProductFormModal';
import {
  buildLabelsDocument, openPrintWindow, discountedPrice, type LabelProduct,
} from '@/lib/services/label-print';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';

interface Product extends LabelProduct {
  id: string;
  image_url?: string | null;
  category_name?: string | null;
}
interface Station { id: string; store_id: string; store_name: string; name: string }
interface TaxRate { id: string; code: string; rate: number; label: string; is_default: boolean }

export default function PdaLabelApp({ userName, canWrite }: { userName: string; canWrite: boolean }) {
  const brand = useBrand();
  const [station, setStation] = useState<Station | null | undefined>(undefined);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [binding, setBinding] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [settings, setSettings] = useState<LabelSettings>(LABEL_DEFAULTS);
  const [cloudPrinter, setCloudPrinter] = useState<string | null>(null);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [qtyStr, setQtyStr] = useState('1');
  const qty = Math.min(200, Math.max(0, parseInt(qtyStr || '0', 10) || 0));
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [createFor, setCreateFor] = useState<string | null>(null); // barcode prérempli ('' = vide)
  const photoRef = useRef<HTMLInputElement>(null);

  // ---- Résolution de la station (PDA ↔ boutique) ----
  useEffect(() => {
    void (async () => {
      const deviceId = getOrCreateDeviceId();
      const r = await fetch(`/api/label-stations/mine?device_id=${encodeURIComponent(deviceId)}`);
      const st = r.ok ? ((await r.json()).station as Station | null) : null;
      if (st) { setStation(st); return; }
      const me = await fetch('/api/me');
      const accessible = me.ok ? (((await me.json()).stores ?? []) as { id: string; name: string }[]) : [];
      setStores(accessible);
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

  // ---- Chargement catalogue (boutique du PDA) + réglages étiquettes ----
  async function reloadProducts(storeId: string) {
    const r = await fetch(`/api/products?active=true&store_id=${encodeURIComponent(storeId)}`);
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
        image_url: (p.image_url as string) ?? null,
        category_name: (p.category_name as string) ?? null,
      })));
    }
  }
  useEffect(() => {
    if (!station) return;
    setLoading(true);
    void (async () => {
      const [, s, rc, tx] = await Promise.all([
        reloadProducts(station.store_id),
        fetch('/api/settings/labels'),
        fetch('/api/cloudprnt/printers'),
        fetch('/api/tax-rates'),
      ]);
      if (s.ok) setSettings((await s.json()).settings as LabelSettings);
      if (rc.ok) {
        const printers = (await rc.json()).printers as Array<{ label: string; role: string; enabled: boolean }>;
        const p = printers.find((x) => x.role === 'label' && x.enabled);
        setCloudPrinter(p ? p.label : null);
      }
      if (tx.ok) setTaxRates(((await tx.json()).tax_rates as TaxRate[]).map((t) => ({ ...t, rate: Number(t.rate) })));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station]);

  // Garde le focus sur la recherche : le scanner PDA « tape » le code + Entrée.
  useEffect(() => {
    if (station && !selected && !showScanner && createFor === null) searchRef.current?.focus();
  }, [station, selected, showScanner, createFor, loading]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.barcode?.toLowerCase().includes(s) ?? false),
    );
  }, [products, q]);

  // Traite un code (scan matériel via Entrée, ou caméra) : ouvre la fiche si
  // trouvé, sinon propose la création avec le code prérempli.
  function handleCode(raw: string) {
    const s = raw.trim();
    if (!s) return;
    const exact = products.find((p) => p.barcode === s || p.sku === s || p.barcode === s.toUpperCase());
    if (exact) { openProduct(exact); return; }
    if (filtered.length === 1) { openProduct(filtered[0]!); return; }
    if (canWrite) setCreateFor(s);
    else setMsg('Article introuvable pour ce code.');
  }

  function openProduct(p: Product) { setSelected(p); setQtyStr('1'); setQ(''); setMsg(null); }
  function backToList() { setSelected(null); setMsg(null); }

  function pressQty(k: string) {
    setQtyStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      if (next.length > 3) return cur;
      return Number(next) > 200 ? '200' : next;
    });
  }

  async function print() {
    if (!selected || qty < 1) return;
    setMsg(null); setSending(true);
    if (cloudPrinter) {
      const r = await fetch('/api/cloudprnt/print-labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ product: selected, qty }], store_id: station?.store_id ?? null }),
      });
      setSending(false);
      if (r.ok) { const j = await r.json(); setMsg(`✅ ${j.count} étiquette(s) envoyée(s) à « ${j.printer} ».`); }
      else setMsg('❌ Échec de l’envoi à l’imprimante.');
    } else {
      const doc = buildLabelsDocument([{ product: selected, qty }], settings);
      setSending(false);
      if (!openPrintWindow(doc)) setMsg('Autorisez les fenêtres pop-up pour imprimer.');
    }
  }

  // ---- Photo : capture + compression + enregistrement sur l'article ----
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    setPhotoBusy(true); setMsg(null);
    try {
      const dataUrl = await compressImage(file, 900, 0.7);
      const r = await fetch(`/api/products/${selected.id}/photo`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: dataUrl }),
      });
      if (r.ok) {
        setSelected((cur) => (cur ? { ...cur, image_url: dataUrl } : cur));
        setProducts((cur) => cur.map((p) => (p.id === selected.id ? { ...p, image_url: dataUrl } : p)));
        setMsg('📷 Photo enregistrée.');
      } else setMsg('❌ Échec de l’enregistrement de la photo.');
    } catch { setMsg('❌ Photo illisible.'); }
    setPhotoBusy(false);
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    window.location.assign('/login');
  }

  // ---- Écran de choix de boutique ----
  if (station === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-bg p-6">
        <div className="card w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <BrandLogo brand={brand} />
            <div className="text-sm font-semibold">Station d&apos;étiquettes</div>
          </div>
          <h1 className="text-lg font-semibold">Choisir la boutique de ce PDA</h1>
          <p className="mt-1 text-sm text-ink-soft">Ce terminal n&apos;affichera que les articles de la boutique choisie.</p>
          <div className="mt-4 space-y-2">
            {stores.length === 0 ? (
              <p className="text-sm text-ink-soft">Aucune boutique accessible avec ce compte.</p>
            ) : stores.map((s) => (
              <button key={s.id} disabled={binding} onClick={() => void bind(s.id)} className="w-full btn-soft h-12 justify-between">
                <span>{s.name}</span><span className="text-ink-soft">→</span>
              </button>
            ))}
          </div>
          <button onClick={() => void logout()} className="mt-4 text-sm text-ink-soft hover:text-ink">Quitter</button>
        </div>
      </div>
    );
  }
  if (station === undefined) {
    return <div className="min-h-screen grid place-items-center text-sm text-ink-soft">Chargement…</div>;
  }

  const disc = selected && settings.show_discount ? discountedPrice(selected) : null;

  return (
    <div className="h-screen flex flex-col bg-bg text-ink overflow-hidden">
      {/* Barre d'en-tête (sans titre) */}
      <header className="shrink-0 h-12 border-b border-border bg-surface flex items-center gap-2 px-3">
        <BrandLogo brand={brand} small />
        <div className="flex-1" />
        <span className="text-xs text-ink-soft truncate max-w-[45%]">{userName}</span>
        <button onClick={() => void logout()} className="text-sm text-ink-soft hover:text-ink px-2 py-1 rounded hover:bg-gray-100">Quitter</button>
      </header>

      {/* ============ PARTIE HAUTE ============ */}
      <section className="h-[46%] shrink-0 border-b-2 border-border bg-surface overflow-y-auto">
        {!selected ? (
          <div className="h-full p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {/* Scan caméra : petit bouton d'appoint (le lecteur du PDA
                  reste le moyen principal, sans bouton). */}
              <button onClick={() => setShowScanner(true)} className="btn-soft h-11 px-3 text-sm shrink-0">
                📷 Scanner
              </button>
              {canWrite && (
                <button onClick={() => setCreateFor('')} className="btn-primary h-11 flex-1 text-base">
                  ＋ Créer un article
                </button>
              )}
            </div>
            <p className="text-xs text-ink-soft">
              Scannez directement avec le lecteur du PDA — la recherche se fait sans bouton.
            </p>
            {msg && <p className="text-sm text-ink-soft">{msg}</p>}
          </div>
        ) : (
          <div className="h-full p-4 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold leading-tight line-clamp-2">{selected.name}</div>
                <div className="text-sm text-ink-soft">
                  {disc != null && <span className="line-through mr-1">{formatEUR(selected.sale_price_ttc)}</span>}
                  <span className="font-semibold text-ink">{formatEUR(disc ?? selected.sale_price_ttc)}</span>
                  {selected.barcode ? ` · ${selected.barcode}` : ' · pas de code-barres'}
                </div>
              </div>
              <button onClick={backToList} className="text-ink-soft hover:text-ink text-xl leading-none shrink-0">✕</button>
            </div>

            <div className="mt-2 flex-1 min-h-0 grid grid-cols-[1fr_auto] gap-3">
              <div className="flex flex-col min-h-0">
                <div className="text-xs text-ink-soft">Nombre d&apos;étiquettes</div>
                <div className="mt-1 rounded-xl border border-border h-12 px-4 flex items-center justify-end text-2xl font-semibold tabular-nums bg-white">
                  {qtyStr === '' ? <span className="text-ink-soft/40">0</span> : qtyStr}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 flex-1 min-h-0">
                  {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
                    <button key={k} onClick={() => pressQty(k)}
                      className={`rounded-lg text-lg font-semibold min-h-[40px] ${
                        k === 'C' ? 'bg-danger/10 text-danger'
                        : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                        : 'bg-gray-50 border border-border'}`}>{k}</button>
                  ))}
                </div>
              </div>
              <div className="w-32 flex flex-col gap-2">
                <button onClick={() => void print()} disabled={qty < 1 || sending}
                        className="btn-primary flex-1 flex-col gap-1 text-sm">
                  <span className="text-2xl">🖨</span>
                  <span>{sending ? '…' : cloudPrinter ? 'Imprimer' : 'PDF'}</span>
                </button>
                {canWrite && (
                  <button onClick={() => photoRef.current?.click()} disabled={photoBusy}
                          className="btn-soft flex-1 flex-col gap-1 text-sm">
                    <span className="text-2xl">📷</span>
                    <span>{photoBusy ? '…' : 'Photo'}</span>
                  </button>
                )}
              </div>
            </div>
            {msg && <p className="mt-1 text-sm text-center">{msg}</p>}
          </div>
        )}
      </section>

      {/* ============ PARTIE BASSE ============ */}
      <section className="flex-1 min-h-0 flex flex-col">
        {!selected ? (
          <>
            <div className="shrink-0 p-2 border-b border-border bg-surface">
              <input
                ref={searchRef}
                className="input h-12 text-base w-full"
                placeholder="Rechercher ou scanner…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCode(q); } }}
                autoFocus autoComplete="off" enterKeyHint="search"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-sm text-ink-soft">Chargement…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-ink-soft">Aucun article.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button onClick={() => openProduct(p)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 active:bg-gray-100">
                        {p.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover shrink-0 bg-gray-100" />
                          : <span className="h-10 w-10 rounded bg-gray-100 grid place-items-center text-ink-soft/50 shrink-0">🏷</span>}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-ink-soft truncate">{p.barcode ?? '— pas de code-barres —'}</div>
                        </div>
                        <div className="font-semibold tabular-nums whitespace-nowrap">{formatEUR(p.sale_price_ttc)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <button onClick={backToList} className="text-sm text-accent-deep hover:underline">← Retour à la liste</button>
            <div className="mt-3 flex gap-4">
              <div className="h-28 w-28 rounded-xl overflow-hidden bg-gray-100 grid place-items-center shrink-0">
                {selected.image_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={selected.image_url} alt="" className="h-full w-full object-cover" />
                  : <span className="text-4xl text-ink-soft/40">🏷</span>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-lg font-semibold leading-tight">{selected.name}</div>
                <div className="text-2xl font-bold">{formatEUR(disc ?? selected.sale_price_ttc)}</div>
                <dl className="text-sm text-ink-soft space-y-0.5">
                  <div>Code-barres : <span className="font-mono text-ink">{selected.barcode ?? '—'}</span></div>
                  {selected.sku && <div>SKU : <span className="font-mono text-ink">{selected.sku}</span></div>}
                  {selected.category_name && <div>Catégorie : <span className="text-ink">{selected.category_name}</span></div>}
                </dl>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Caméra de scan */}
      {showScanner && (
        <BarcodeScannerModal
          onClose={() => setShowScanner(false)}
          onScan={(code) => { setShowScanner(false); handleCode(code); }}
        />
      )}

      {/* Création d'article — formulaire complet (identique au back-office),
          rattaché à la boutique du PDA, code-barres scanné pré-rempli. */}
      {createFor !== null && (
        <ProductFormModal
          product={null}
          taxRates={taxRates}
          categories={[]}
          backOffice={false}
          prefillBarcode={createFor || undefined}
          posteStoreOverride={station.store_id}
          onClose={() => setCreateFor(null)}
          onSaved={async () => { setCreateFor(null); await reloadProducts(station.store_id); }}
        />
      )}

      {/* Input photo caché (capture appareil) */}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e)} />
    </div>
  );
}

function BrandLogo({ brand, small }: { brand: { logo_url: string; brand_name: string }; small?: boolean }) {
  const cls = small ? 'h-8 w-auto max-w-[120px]' : 'h-9 w-auto max-w-[150px]';
  return brand.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo_url} alt={brand.brand_name} className={`${cls} object-contain`} />
  ) : (
    <span className={`grid ${small ? 'h-8 w-8' : 'h-9 w-9'} place-items-center rounded-xl accent-bar text-white font-semibold`}>
      {(brand.brand_name || 'H').charAt(0)}
    </span>
  );
}

/** Réduit une image (fichier) en data URL JPEG compressée. */
function compressImage(file: File, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no ctx')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}
