'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import PaymentModal from './PaymentModal';
import ReceiptPreviewModal from './ReceiptPreviewModal';
import HoldListModal from './HoldListModal';
import OpenSessionModal from './OpenSessionModal';
import FreePriceModal from './FreePriceModal';
import { tileMetrics, type PosUiSettings } from '@/lib/settings/pos-ui';

export interface PosProduct {
  id: string;
  name: string;
  sale_price_ttc: number;
  price_is_free: boolean;
  tax_rate: number;
  tax_rate_id: string;
  tax_rate_code: string;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  barcode: string | null;
  sku: string | null;
  image_url: string | null;
  short_description: string | null;
  is_customizable: boolean;
  tags: string[];
}

export interface Category {
  id: string;
  name: string;
  color: string | null;
}

export interface CartLine {
  key: string;
  product_id: string | null;
  variant_id: string | null;
  label: string;
  unit_price_ttc: number;
  quantity: number;
  discount_amount: number;
  tax_rate: number;
  tax_rate_code: string;
  metadata: Record<string, unknown>;
}

export interface TaxRate { id: string; code: string; rate: number; is_default: boolean; }

interface Props {
  stores: { id: string; code: string; name: string }[];
  registers: { id: string; store_id: string; code: string; name: string }[];
  taxRates: TaxRate[];
  currentUser: { id: string; name: string; role: string };
  posUi: PosUiSettings;
}

const FREE_PRICE_TAX_CODE_DEFAULT = 'TVA20';

export default function CashRegister({ stores, registers, taxRates, currentUser, posUi }: Props) {
  const metrics = useMemo(() => tileMetrics(posUi.tile_size), [posUi.tile_size]);
  const [storeId, setStoreId] = useState<string>(stores[0]!.id);
  const registersForStore = useMemo(
    () => registers.filter((r) => r.store_id === storeId),
    [registers, storeId],
  );
  const [registerId, setRegisterId] = useState<string>(registersForStore[0]?.id ?? '');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showOpenSession, setShowOpenSession] = useState(false);

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');

  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [savingLines, setSavingLines] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [showFreePrice, setShowFreePrice] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Charge produits + catégories
  useEffect(() => {
    void (async () => {
      const [pRes, cRes] = await Promise.all([
        fetch('/api/products?pos=1'),
        fetch('/api/categories'),
      ]);
      if (pRes.ok) {
        const j = await pRes.json();
        setProducts(
          j.products.map((p: Record<string, unknown>) => ({
            ...p,
            sale_price_ttc: Number(p.sale_price_ttc),
            tax_rate: Number(p.tax_rate),
          })),
        );
      }
      if (cRes.ok) setCategories((await cRes.json()).categories);
    })();
  }, []);

  // Vérifie session caisse
  const refreshSession = useCallback(async () => {
    if (!registerId) return;
    setSessionLoading(true);
    const res = await fetch(`/api/cash-sessions?register_id=${registerId}`);
    if (res.ok) {
      const j = await res.json();
      setSessionId(j.session?.id ?? null);
    }
    setSessionLoading(false);
  }, [registerId]);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

  // Persiste lignes côté serveur (debounced)
  useEffect(() => {
    if (!saleId) return;
    const t = setTimeout(() => { void syncLines(); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, saleId]);

  const ensureSale = useCallback(async (): Promise<string | null> => {
    if (saleId) return saleId;
    if (!sessionId) { setError('Aucune session caisse ouverte.'); return null; }
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, register_id: registerId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? 'Création vente impossible');
      return null;
    }
    const { id } = await res.json();
    setSaleId(id);
    return id;
  }, [saleId, sessionId, storeId, registerId]);

  async function syncLines() {
    if (!saleId) return;
    setSavingLines(true);
    setError(null);
    try {
      const res = await fetch(`/api/sales/${saleId}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lines.map((l) => ({
            product_id: l.product_id,
            variant_id: l.variant_id,
            label: l.label,
            unit_price_ttc: l.unit_price_ttc,
            quantity: l.quantity,
            discount_amount: l.discount_amount,
            tax_rate: l.tax_rate,
            tax_rate_code: l.tax_rate_code,
            metadata: l.metadata,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(`Sync : ${j.error ?? 'erreur'}`);
      }
    } finally { setSavingLines(false); }
  }

  // Filtrage produits
  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory !== 'all' && p.category_id !== activeCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode === q
      );
    });
  }, [products, search, activeCategory]);

  // Totaux locaux (l'autorité reste le serveur, mais c'est utile pour l'UX)
  const totals = useMemo(() => {
    let ttc = 0, ht = 0, tva = 0, discount = 0;
    const byRate = new Map<number, { base_ht: number; tva: number; ttc: number }>();
    for (const l of lines) {
      const rawTtc = l.unit_price_ttc * l.quantity - l.discount_amount;
      const lineTtc = Math.max(0, round2(rawTtc));
      const lineHt = round2(lineTtc / (1 + l.tax_rate / 100));
      const lineTva = round2(lineTtc - lineHt);
      ttc = round2(ttc + lineTtc); ht = round2(ht + lineHt); tva = round2(tva + lineTva);
      discount = round2(discount + l.discount_amount);
      const b = byRate.get(l.tax_rate) ?? { base_ht: 0, tva: 0, ttc: 0 };
      b.base_ht = round2(b.base_ht + lineHt);
      b.tva = round2(b.tva + lineTva);
      b.ttc = round2(b.ttc + lineTtc);
      byRate.set(l.tax_rate, b);
    }
    return {
      ttc, ht, tva, discount,
      breakdown: Array.from(byRate.entries()).sort((a,b)=>b[0]-a[0]),
    };
  }, [lines]);

  function addProduct(p: PosProduct) {
    void ensureSale();
    if (p.price_is_free) { setShowFreePrice(true); return; }
    setLines((cur) => {
      // empile si même produit + même prix + même tva
      const existing = cur.find(
        (l) => l.product_id === p.id && l.unit_price_ttc === p.sale_price_ttc && l.discount_amount === 0,
      );
      if (existing) {
        return cur.map((l) => l === existing ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...cur, {
        key: cryptoKey(),
        product_id: p.id, variant_id: null,
        label: p.name, unit_price_ttc: p.sale_price_ttc,
        quantity: 1, discount_amount: 0,
        tax_rate: p.tax_rate, tax_rate_code: p.tax_rate_code,
        metadata: {},
      }];
    });
  }

  function addFreeBouquet(amount: number, taxCode: string, label: string) {
    const tax = taxRates.find((t) => t.code === taxCode) ?? taxRates[0]!;
    setLines((cur) => [...cur, {
      key: cryptoKey(),
      product_id: null, variant_id: null,
      label, unit_price_ttc: amount, quantity: 1, discount_amount: 0,
      tax_rate: tax.rate, tax_rate_code: tax.code, metadata: { freeform: true },
    }]);
    setShowFreePrice(false);
    void ensureSale();
  }

  function incLine(key: string, delta: number) {
    setLines((cur) =>
      cur
        .map((l) => l.key === key ? { ...l, quantity: round2(l.quantity + delta) } : l)
        .filter((l) => l.quantity > 0),
    );
  }
  function removeLine(key: string) { setLines((cur) => cur.filter((l) => l.key !== key)); }
  function setLineDiscount(key: string, amount: number) {
    setLines((cur) => cur.map((l) => l.key === key ? { ...l, discount_amount: Math.max(0, amount) } : l));
  }

  async function holdSale() {
    if (!saleId) return;
    const label = window.prompt('Libellé du panier en attente ?', `Panier ${new Date().toLocaleTimeString('fr-FR')}`);
    if (!label) return;
    const res = await fetch(`/api/sales/${saleId}/hold`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (res.ok) {
      setSaleId(null); setLines([]);
    }
  }

  async function recallSale(id: string) {
    const res = await fetch(`/api/sales/${id}`);
    if (!res.ok) return;
    const j = await res.json();
    setSaleId(id);
    setLines(
      (j.lines as Record<string, unknown>[]).map((l) => ({
        key: cryptoKey(),
        product_id: (l.product_id as string) ?? null,
        variant_id: (l.variant_id as string) ?? null,
        label: l.label as string,
        unit_price_ttc: Number(l.unit_price_ttc),
        quantity: Number(l.quantity),
        discount_amount: Number(l.discount_amount),
        tax_rate: Number(l.tax_rate),
        tax_rate_code: l.tax_rate_code as string,
        metadata: (l.metadata as Record<string, unknown>) ?? {},
      })),
    );
    setShowHeld(false);
  }

  async function onValidated(receiptId: string, receiptNumber: string) {
    setReceipt({ id: receiptId, number: receiptNumber });
    setShowPayment(false);
    setSaleId(null); setLines([]);
  }

  // Raccourcis clavier
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault(); searchRef.current?.focus();
      } else if (e.key === 'F2') { e.preventDefault(); setShowFreePrice(true); }
      else if (e.key === 'F4') { e.preventDefault(); setShowHeld(true); }
      else if (e.key === 'F9' && lines.length > 0) { e.preventDefault(); setShowPayment(true); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines.length]);

  if (sessionLoading) {
    return <div className="p-8 text-ink-soft">Chargement caisse…</div>;
  }

  if (!sessionId) {
    return (
      <>
        <div className="p-8">
          <div className="card p-6 max-w-xl">
            <h1 className="text-xl font-semibold">Ouvrir la caisse</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Aucune session active sur cette caisse. Ouvrez la caisse en saisissant le fond.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <label className="text-sm text-ink-soft">Boutique :</label>
              <select className="input max-w-xs" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <label className="text-sm text-ink-soft ml-2">Caisse :</label>
              <select className="input max-w-xs" value={registerId} onChange={(e) => setRegisterId(e.target.value)}>
                {registersForStore.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <button className="btn-primary mt-4" onClick={() => setShowOpenSession(true)}>
              Ouvrir la caisse
            </button>
          </div>
        </div>
        {showOpenSession && (
          <OpenSessionModal
            storeId={storeId}
            registerId={registerId}
            onClose={() => setShowOpenSession(false)}
            onOpened={() => { setShowOpenSession(false); void refreshSession(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_420px] h-screen">
      {/* Gauche : produits */}
      <div className="flex flex-col bg-bg">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-surface">
          <input
            ref={searchRef}
            className="input flex-1"
            placeholder="Rechercher (/) ou scanner un code-barres…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && search.trim()) {
                const match = products.find((p) => p.barcode === search.trim());
                if (match) { addProduct(match); setSearch(''); }
              }
            }}
          />
          <button className="btn-soft" onClick={() => setShowFreePrice(true)} title="F2">
            ✿ Bouquet prix libre
          </button>
          <button className="btn-ghost" onClick={() => setShowHeld(true)} title="F4">
            Paniers en attente
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto px-5 py-3 border-b border-border bg-surface">
          <CategoryChip active={activeCategory === 'all'} label="Tout" onClick={() => setActiveCategory('all')} />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              active={activeCategory === c.id}
              label={c.name}
              color={c.color}
              onClick={() => setActiveCategory(c.id)}
            />
          ))}
        </div>

        <div className="flex-1 overflow-auto p-5">
          {visibleProducts.length === 0 ? (
            <div className="text-center text-ink-soft mt-12">
              Aucun produit. Ajoutez-en dans <a className="underline" href="/products">Produits</a>.
            </div>
          ) : (
            <div className={`grid ${metrics.grid} ${metrics.gap}`}>
              {visibleProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className={`card ${metrics.padding} text-left hover:shadow-md hover:border-sage/40 transition-all active:scale-[0.98]`}
                >
                  {posUi.show_product_image && (
                    <div className="mb-2 h-14 w-full rounded-lg bg-sage-soft grid place-items-center text-sage-deep overflow-hidden">
                      {p.image_url
                        ? <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        : <span>✿</span>}
                    </div>
                  )}
                  <div className={`${metrics.titleFontSize} ${metrics.titleMinHeight} font-medium line-clamp-2 leading-tight`}>
                    {p.name}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    {posUi.show_price && (
                      <span className={`${metrics.priceFontSize} font-semibold`}>
                        {p.price_is_free ? 'libre' : formatEUR(p.sale_price_ttc)}
                      </span>
                    )}
                    {posUi.show_tax_badge && <span className="chip">{p.tax_rate}%</span>}
                  </div>
                  {posUi.show_category_badge && p.category_name && (
                    <div className="mt-1 text-[11px] text-ink-soft truncate">{p.category_name}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Droite : panier */}
      <aside className="flex flex-col bg-surface border-l border-border">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-soft">Panier</div>
            <div className="text-sm font-medium">
              {lines.length} ligne(s){savingLines ? ' · sync…' : ''}
            </div>
          </div>
          <button
            disabled={lines.length === 0}
            onClick={() => { setLines([]); setSaleId(null); }}
            className="btn-ghost text-xs"
          >
            Vider
          </button>
        </div>

        <div className="flex-1 overflow-auto px-3 py-2 space-y-2">
          {lines.length === 0 ? (
            <div className="mt-12 text-center text-ink-soft text-sm">
              Sélectionnez un produit pour commencer.
            </div>
          ) : lines.map((l) => (
            <div key={l.key} className="rounded-xl border border-border p-3">
              <div className="flex justify-between gap-2">
                <div className="text-sm font-medium flex-1">{l.label}</div>
                <button onClick={() => removeLine(l.key)} className="text-ink-soft hover:text-danger">✕</button>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-ink-soft">
                <span>{formatEUR(l.unit_price_ttc)} · TVA {l.tax_rate}%</span>
                <div className="flex items-center gap-1">
                  <button className="h-7 w-7 rounded-lg border border-border" onClick={() => incLine(l.key, -1)}>-</button>
                  <span className="w-8 text-center text-ink">{l.quantity}</span>
                  <button className="h-7 w-7 rounded-lg border border-border" onClick={() => incLine(l.key, +1)}>+</button>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <input
                  type="number" min={0} step="0.01"
                  className="input h-8 w-28 text-xs"
                  placeholder="Remise €"
                  value={l.discount_amount || ''}
                  onChange={(e) => setLineDiscount(l.key, Number(e.target.value || 0))}
                />
                <span className="font-semibold">
                  {formatEUR(Math.max(0, round2(l.unit_price_ttc * l.quantity - l.discount_amount)))}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-5 py-3 space-y-1 text-sm">
          {totals.breakdown.map(([rate, b]) => (
            <div key={rate} className="flex justify-between text-ink-soft">
              <span>TVA {rate}% (HT {formatEUR(b.base_ht)})</span>
              <span>{formatEUR(b.tva)}</span>
            </div>
          ))}
          <div className="flex justify-between text-ink-soft">
            <span>Total HT</span><span>{formatEUR(totals.ht)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-warning">
              <span>Remises</span><span>-{formatEUR(totals.discount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-lg font-semibold">Total TTC</span>
            <span className="text-2xl font-semibold tracking-tight">{formatEUR(totals.ttc)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 border-t border-border">
          <button
            disabled={lines.length === 0 || !saleId}
            className="btn-soft"
            onClick={() => void holdSale()}
          >
            Mettre en attente
          </button>
          <button
            disabled={lines.length === 0 || totals.ttc <= 0}
            className="btn-primary text-base h-12"
            onClick={async () => { const id = await ensureSale(); if (id) { await syncLines(); setShowPayment(true); } }}
          >
            Encaisser · {formatEUR(totals.ttc)}
          </button>
        </div>

        {error && (
          <div className="border-t border-danger/20 bg-danger/5 px-4 py-2 text-xs text-danger">
            {error}
          </div>
        )}
      </aside>

      {showPayment && saleId && (
        <PaymentModal
          saleId={saleId}
          totalTtc={totals.ttc}
          onClose={() => setShowPayment(false)}
          onValidated={onValidated}
        />
      )}
      {receipt && (
        <ReceiptPreviewModal
          receipt={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
      {showHeld && (
        <HoldListModal
          registerId={registerId}
          onClose={() => setShowHeld(false)}
          onPick={recallSale}
        />
      )}
      {showFreePrice && (
        <FreePriceModal
          defaultTaxCode={
            taxRates.find((t) => t.is_default)?.code ?? FREE_PRICE_TAX_CODE_DEFAULT
          }
          taxRates={taxRates}
          onClose={() => setShowFreePrice(false)}
          onConfirm={addFreeBouquet}
        />
      )}
    </div>
  );
}

function CategoryChip({ active, label, color, onClick }: {
  active: boolean; label: string; color?: string | null; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium
                  border transition-colors ${active
                    ? 'bg-sage text-white border-sage'
                    : 'bg-white text-ink border-border hover:bg-sage-soft hover:border-sage/40'}`}
      style={!active && color ? { borderColor: color } : undefined}
    >
      {label}
    </button>
  );
}

function cryptoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
