'use client';

import { useMemo, useRef, useState } from 'react';

/**
 * Entrée multiple (PDA) : on scanne des articles EN SÉRIE (chaque scan = +1),
 * on ajuste les quantités si besoin, puis on VALIDE tout en une fois. Les
 * mouvements de stock sont enregistrés en une seule transaction (endpoint
 * /api/stock/movement/batch).
 */

interface ScanProduct { id: string; name: string; barcode: string | null; sku: string | null; extra_barcodes?: string[] | null }
interface CartItem { product: ScanProduct; qty: number }

export default function PdaBatchStock({
  storeId, products, onClose, onDone,
}: {
  storeId: string;
  products: ScanProduct[];
  onClose: () => void;
  onDone?: (count: number) => void;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CartItem | null>(null);
  const [editStr, setEditStr] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, ScanProduct>();
    for (const p of products) {
      if (p.barcode) m.set(p.barcode.toLowerCase(), p);
      if (p.sku) m.set(p.sku.toLowerCase(), p);
      for (const b of p.extra_barcodes ?? []) if (b) m.set(b.toLowerCase(), p);
    }
    return m;
  }, [products]);

  function addOne(p: ScanProduct, delta = 1) {
    setCart((cur) => {
      const idx = cur.findIndex((x) => x.product.id === p.id);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx]!, qty: Math.max(0, next[idx]!.qty + delta) };
        // Remonte l'article scanné en tête pour le voir tout de suite.
        const [item] = next.splice(idx, 1);
        return [item!, ...next];
      }
      return [{ product: p, qty: Math.max(1, delta) }, ...cur];
    });
  }

  function handleCode(raw: string) {
    const s = raw.trim();
    if (!s) return;
    const p = byCode.get(s.toLowerCase());
    if (!p) { setMsg(`❌ Article introuvable : « ${s} »`); return; }
    addOne(p, 1);
    setMsg(`✓ ${p.name}`);
    setTimeout(() => scanRef.current?.focus(), 20);
  }

  function setQty(id: string, qty: number) {
    setCart((cur) => cur.map((x) => (x.product.id === id ? { ...x, qty: Math.max(0, qty) } : x)));
  }
  function remove(id: string) {
    setCart((cur) => cur.filter((x) => x.product.id !== id));
  }

  // ---- Clavier de saisie d'une quantité ----
  function openEdit(it: CartItem) { setEdit(it); setEditStr(String(it.qty)); }
  function pressKey(k: string) {
    setEditStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      return next.length > 5 ? cur : next;
    });
  }
  function saveEdit() {
    if (!edit) return;
    const q = Number(editStr || '0') || 0;
    if (q <= 0) remove(edit.product.id);
    else setQty(edit.product.id, q);
    setEdit(null);
  }

  const totalUnits = useMemo(() => cart.reduce((s, x) => s + x.qty, 0), [cart]);

  async function validate() {
    const items = cart.filter((x) => x.qty > 0);
    if (items.length === 0) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/stock/movement/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          movement_type: 'purchase',
          reason: 'Entrée multiple PDA',
          items: items.map((x) => ({ product_id: x.product.id, quantity_delta: x.qty })),
        }),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({ applied: items.length }));
        onDone?.(j.applied ?? items.length);
        setCart([]);
        setMsg(`✅ Entrée validée : ${j.applied ?? items.length} article(s), ${totalUnits} unité(s).`);
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(j.error === 'FORBIDDEN' ? '❌ Droits insuffisants.' : "❌ Échec de l'entrée.");
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-ink overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
        <button onClick={onClose} className="text-sm text-accent-deep hover:underline">← Retour</button>
        <div className="flex-1 text-center font-semibold">Entrée multiple</div>
        <div className="w-14" />
      </header>

      {/* Zone de scan */}
      <div className="shrink-0 p-3 border-b border-border bg-surface">
        <div className="text-xs text-ink-soft mb-1">Scannez les articles en série (chaque scan = +1)</div>
        <input
          ref={scanRef}
          className="input h-12 w-full text-base font-mono"
          placeholder="Code-barres / SKU…"
          autoComplete="off" autoFocus
          onBlur={() => setTimeout(() => { if (!edit) scanRef.current?.focus(); }, 60)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const el = e.currentTarget; const v = el.value; el.value = '';
            if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
            if (v.trim()) handleCode(v);
          }}
          onInput={(e) => {
            const el = e.currentTarget; const val = el.value;
            const nl = val.search(/[\r\n\t]/);
            if (nl >= 0) {
              const code = val.slice(0, nl); el.value = '';
              if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
              if (code.trim()) handleCode(code);
              return;
            }
            if (scanTimer.current) clearTimeout(scanTimer.current);
            scanTimer.current = setTimeout(() => {
              const code = el.value;
              if (code.trim().length >= 4) { el.value = ''; handleCode(code); }
            }, 150);
          }}
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-ink-soft">{cart.length} article(s) · {totalUnits} unité(s)</span>
          {busy && <span className="text-ink-soft">…</span>}
        </div>
        {msg && <div className="mt-1 text-sm">{msg}</div>}
      </div>

      {/* Panier */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft text-center">
            Scannez un premier article pour démarrer la saisie.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {cart.map((it) => (
              <li key={it.product.id} className="px-3 py-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{it.product.name}</div>
                  <div className="text-xs text-ink-soft truncate">{it.product.barcode ?? it.product.sku ?? '— pas de code —'}</div>
                </div>
                <button onClick={() => setQty(it.product.id, it.qty - 1)}
                  className="h-9 w-9 rounded-lg bg-gray-100 text-ink-soft text-xl leading-none shrink-0">−</button>
                <button onClick={() => openEdit(it)}
                  className="h-9 min-w-[3rem] px-2 rounded-lg border border-border font-semibold tabular-nums text-lg shrink-0">
                  {it.qty}
                </button>
                <button onClick={() => addOne(it.product, 1)}
                  className="h-9 w-9 rounded-lg bg-gray-100 text-ink-soft text-xl leading-none shrink-0">+</button>
                <button onClick={() => remove(it.product.id)}
                  className="h-9 w-9 rounded-lg text-danger text-lg leading-none shrink-0" aria-label="Retirer">✕</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Valider */}
      <div className="shrink-0 p-3 border-t border-border bg-surface">
        <button onClick={() => void validate()} disabled={busy || totalUnits === 0}
          className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40">
          {busy ? '…' : totalUnits > 0 ? `Valider l'entrée (${totalUnits} unité${totalUnits > 1 ? 's' : ''})` : "Valider l'entrée"}
        </button>
      </div>

      {/* Clavier quantité */}
      {edit && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink/40" onClick={() => setEdit(null)}>
          <div className="bg-surface rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}
               style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="font-semibold leading-tight">{edit.product.name}</div>
            <div className="text-xs text-ink-soft">Quantité à entrer</div>
            <div className="mt-2 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
              {editStr === '' ? <span className="text-ink-soft/40">0</span> : editStr}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
                <button key={k} onClick={() => pressKey(k)}
                  className={`h-14 rounded-xl text-xl font-semibold ${
                    k === 'C' ? 'bg-danger/10 text-danger'
                    : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                    : 'bg-gray-50 border border-border'}`}>{k}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setEdit(null)} className="btn-soft h-12">Annuler</button>
              <button onClick={saveEdit} className="btn-primary h-12">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
