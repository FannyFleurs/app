'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdaProduct, Station } from './PdaApp';
import { useCodeIndex, useScanField, normalizeCode } from './scan';
import {
  STOCK_MOVEMENT_REASONS_DEFAULTS,
  mergeStockMovementReasonsDefaults,
  type StockMovementReasonsSettings,
} from '@/lib/settings/stock-movement-reasons';
import {
  Screen, Header, ScanField, ActionBar, Toast, IconTrash,
} from './ui';

/**
 * Déstockage : on scanne à la chaîne les articles à sortir du stock (casse,
 * péremption, perte…), chaque scan = −1, comme l'onglet « Série » de
 * l'Entrée de marchandise mais en sens inverse. Un motif est toujours requis
 * avant de valider (c'est une sortie de stock, jamais une entrée — même
 * règle que /app/(app)/stock/MovementModals.tsx::TypeAndReasonModal).
 *
 * La série validée reçoit un code unique (ex. D-2026-000013), à noter sur le
 * contenant jeté pour la retrouver plus tard — affiché jusqu'au prochain
 * scan ou à la fermeture de l'écran.
 */

interface CartItem { product: PdaProduct; qty: number }

export default function PdaDestockage({
  station, products, onUnknownCode, onHome, notify,
}: {
  station: Station;
  products: PdaProduct[];
  onUnknownCode: (code: string) => void;
  onHome: () => void;
  notify: (text: string, tone?: 'ok' | 'error') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [lastBatch, setLastBatch] = useState<{ reference: string; item_count: number; total_quantity: number } | null>(null);

  // Motif de sortie : voir TypeAndReasonModal — chaque motif configuré porte
  // sa propre case « justification obligatoire » ; un motif libre est
  // obligatoire par défaut. Ici la sortie est toujours le cas (jamais une
  // entrée), donc un motif est systématiquement requis avant de valider.
  const [reasonSettings, setReasonSettings] = useState<StockMovementReasonsSettings>(STOCK_MOVEMENT_REASONS_DEFAULTS);
  const [reasonSheetOpen, setReasonSheetOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetch('/api/settings/stock-movement-reasons');
      if (!r.ok || cancelled) return;
      const j = await r.json();
      if (!cancelled) setReasonSettings(mergeStockMovementReasonsDefaults(j.settings));
    })();
    return () => { cancelled = true; };
  }, []);

  const index = useCodeIndex(products);

  const scanFocusRef = useRef<(() => void) | null>(null);
  const scanClearRef = useRef<(() => void) | null>(null);

  const addToCart = useCallback((p: PdaProduct, delta = 1) => {
    setCart((current) => {
      const idx = current.findIndex((item) => item.product.id === p.id);
      if (idx < 0) return [{ product: p, qty: Math.max(1, delta) }, ...current];
      const next = [...current];
      next[idx] = { ...next[idx]!, qty: Math.max(0, next[idx]!.qty + delta) };
      const [updated] = next.splice(idx, 1);
      return [updated!, ...next];
    });
  }, []);

  const rearmScanner = useCallback(() => {
    const rearm = () => { scanClearRef.current?.(); scanFocusRef.current?.(); };
    requestAnimationFrame(rearm);
    window.setTimeout(rearm, 40);
    window.setTimeout(rearm, 120);
  }, []);

  const apply = useCallback((product: PdaProduct) => {
    addToCart(product, 1);
    setLastBatch(null);
    setMessage({ text: `− ${product.name}`, tone: 'ok' });
    rearmScanner();
  }, [addToCart, rearmScanner]);

  const handleCode = useCallback((rawCode: string) => {
    const code = normalizeCode(rawCode);
    const product = index.get(code);
    if (product) { apply(product); return; }
    setMessage({ text: `Article introuvable : « ${code} »`, tone: 'error' });
    onUnknownCode(code);
    rearmScanner();
  }, [index, apply, onUnknownCode, rearmScanner]);

  const field = useScanField({
    onCode: handleCode,
    onSearch: setSearch,
    canResolve: (code) => index.has(normalizeCode(code)),
    enabled: !reasonSheetOpen,
  });
  const { clear: clearField, focus: focusField } = field;
  scanClearRef.current = clearField;
  scanFocusRef.current = focusField;

  useEffect(() => {
    if (reasonSheetOpen) return;
    requestAnimationFrame(() => focusField());
    const timer = window.setTimeout(() => focusField(), 100);
    return () => window.clearTimeout(timer);
  }, [reasonSheetOpen, focusField]);

  const suggestions = search.trim().length >= 2
    ? products.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase())
        || (p.barcode?.toLowerCase().includes(search.trim().toLowerCase()) ?? false)
        || (p.sku?.toLowerCase().includes(search.trim().toLowerCase()) ?? false),
      ).slice(0, 20)
    : [];

  function pickReason(r: { label: string; justification_required: boolean }) {
    setSelectedLabel(r.label);
    setReason(r.justification_required ? '' : r.label);
  }

  const reasonOk = reason.trim().length > 0;
  const totalUnits = cart.reduce((s, x) => s + x.qty, 0);

  async function validate() {
    const items = cart.filter((x) => x.qty > 0);
    if (items.length === 0 || !reasonOk) return;
    setBusy(true);
    try {
      const r = await fetch('/api/stock/destockage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: station.store_id,
          reason: reason.trim(),
          items: items.map((x) => ({ product_id: x.product.id, quantity: x.qty })),
        }),
      });
      if (r.ok) {
        const j = await r.json() as { reference: string; item_count: number; total_quantity: number };
        notify(`Déstockage ${j.reference} : ${j.item_count} article(s), ${j.total_quantity} unité(s).`);
        setLastBatch(j);
        setCart([]); setMessage(null);
        setSelectedLabel(null); setReason('');
        setTimeout(focusField, 30);
      } else {
        const j = await r.json().catch(() => ({}));
        setMessage({ text: j.error === 'FORBIDDEN' ? 'Droits insuffisants.' : 'Échec du déstockage.', tone: 'error' });
      }
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Header title="Déstockage" onBack={onHome} onHome={onHome} />

      <div className="shrink-0 p-3 bg-surface border-b border-border">
        <div className="text-xs text-ink-soft mb-1.5">Scanner les produits à sortir (chaque scan = −1)</div>
        <ScanField field={field} showClear={search.length > 0} />
        {suggestions.length > 0 && (
          <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-surface">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onPointerDown={(event) => { event.preventDefault(); apply(p); clearField(); setTimeout(focusField, 30); }}
                  className="w-full text-left px-3 py-3 active:bg-gray-100"
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-ink-soft truncate">{p.barcode ?? p.sku ?? 'Sans code'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {cart.length === 0 ? (
          lastBatch ? (
            <div className="p-4">
              <div className="card p-4 text-center">
                <div className="text-xs text-ink-soft mb-1">Dernière série déstockée</div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--primary-deep)' }}>
                  {lastBatch.reference}
                </div>
                <div className="text-xs text-ink-soft mt-1">
                  {lastBatch.item_count} article(s) · {lastBatch.total_quantity} unité(s)
                </div>
                <div className="text-xs text-ink-soft mt-2">Notez ce code sur le contenant jeté.</div>
              </div>
            </div>
          ) : (
            <p className="pt-10 text-center text-sm text-ink-soft">
              Scannez un premier article pour démarrer la série.
            </p>
          )
        ) : (
          <ul className="divide-y divide-border">
            {cart.map((it) => (
              <li key={it.product.id} className="flex items-center gap-2 px-3 py-2.5 bg-surface">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{it.product.name}</div>
                  <div className="text-xs text-ink-soft truncate">Réf. : {it.product.barcode ?? it.product.sku ?? '—'}</div>
                  <div className="text-xs font-semibold mt-0.5 text-danger">Qté à sortir : {it.qty}</div>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  <button onClick={() => addToCart(it.product, -1)} aria-label="Diminuer"
                          className="h-10 w-10 grid place-items-center rounded-lg bg-gray-100 text-xl leading-none text-ink-soft">−</button>
                  <button onClick={() => addToCart(it.product, 1)} aria-label="Augmenter"
                          className="h-10 w-10 grid place-items-center rounded-lg bg-gray-100 text-xl leading-none text-ink-soft">+</button>
                  <button onClick={() => setCart((cur) => cur.filter((x) => x.product.id !== it.product.id))}
                          aria-label="Retirer" className="h-10 w-10 grid place-items-center text-danger">
                    <IconTrash />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {message && <Toast message={message.text} tone={message.tone} />}

      <ActionBar>
        {cart.length > 0 && (
          <div className="flex items-baseline justify-between text-sm mb-2">
            <span className="text-ink-soft">Total articles : <strong className="text-ink">{cart.length}</strong></span>
            <span className="text-ink-soft">Total quantité : <strong className="text-ink">{totalUnits}</strong></span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setReasonSheetOpen(true)}
          disabled={cart.length === 0}
          className="h-12 w-full rounded-xl border border-border bg-surface text-left px-3 flex items-center justify-between disabled:opacity-40"
        >
          <span className="text-sm">
            <span className="text-ink-soft">Motif : </span>
            <span className="font-semibold">{reason.trim() || 'À choisir'}</span>
          </span>
          <span className="text-ink-soft text-xs">Modifier ›</span>
        </button>
        <button
          onClick={() => void validate()}
          disabled={busy || cart.length === 0 || !reasonOk}
          className="btn-primary h-14 w-full text-base font-semibold mt-2 disabled:opacity-40"
        >
          {busy ? '…' : 'Valider le déstockage'}
        </button>
      </ActionBar>

      {reasonSheetOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink/40" onClick={() => setReasonSheetOpen(false)}>
          <div className="bg-surface rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}
               style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="font-semibold leading-tight mb-2">Motif du déstockage</div>
            {reasonSettings.reasons.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {reasonSettings.reasons.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => pickReason(r)}
                    className={`rounded-full px-3 h-10 text-sm font-medium border ${
                      selectedLabel === r.label ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="input"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setSelectedLabel(null); }}
              placeholder="ex : casse, produit périmé…"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setReasonSheetOpen(false)} className="btn-soft h-12">Annuler</button>
              <button
                onClick={() => setReasonSheetOpen(false)}
                disabled={!reasonOk}
                className="btn-primary h-12 disabled:opacity-40"
              >
                Valider le motif
              </button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
