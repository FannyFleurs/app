'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PdaProduct, Station } from './PdaApp';
import { useCodeIndex, useScanner, normalizeCode } from './scan';
import {
  Screen, Header, Tabs, ScanField, ProductCard, Stepper, QtyPad, ActionBar, Toast,
  IconTrash,
} from './ui';

/**
 * Entrée de marchandise.
 *
 *  - « Unitaire » : un article à la fois, quantité ajustable, validation
 *    immédiate. Convient à la réception d'un article ponctuel.
 *  - « Série » : on scanne à la chaîne (chaque scan = +1), on corrige les
 *    quantités si besoin, puis on valide tout en une seule transaction.
 *
 * Dans les deux cas, un code scanné n'est résolu que par correspondance
 * exacte dans l'index des codes. La recherche textuelle ne sert qu'à afficher
 * des suggestions à toucher : elle ne déclenche jamais d'action seule.
 */

interface CartItem { product: PdaProduct; qty: number }

export default function PdaStock({ station, products, onUnknownCode, onHome, notify }: {
  station: Station;
  products: PdaProduct[];
  onUnknownCode: (code: string) => void;
  onHome: () => void;
  notify: (text: string, tone?: 'ok' | 'error') => void;
}) {
  const [tab, setTab] = useState<'single' | 'batch'>('single');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  // Recherche (affichage seulement) et champ de scan non contrôlé.
  const [search, setSearch] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);

  // Onglet « Unitaire »
  const [current, setCurrent] = useState<PdaProduct | null>(null);
  const [qty, setQty] = useState(1);

  // Onglet « Série »
  const [cart, setCart] = useState<CartItem[]>([]);

  // Saisie d'une quantité au pavé numérique.
  const [pad, setPad] = useState<null | { target: 'single' | string; title: string }>(null);
  const [padValue, setPadValue] = useState('');

  const [levels, setLevels] = useState<Map<string, number>>(new Map());

  const index = useCodeIndex(products);

  /* --------------------------------------------------------------- stock */

  const loadLevels = useCallback(async () => {
    try {
      const r = await fetch(`/api/stock/levels?store_id=${encodeURIComponent(station.store_id)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const rows = (await r.json()).levels as Array<{ product_id: string; quantity: string }>;
      setLevels(new Map(rows.map((x) => [x.product_id, Number(x.quantity)])));
    } catch { /* niveau inconnu : on n'affiche simplement rien */ }
  }, [station.store_id]);
  useEffect(() => { void loadLevels(); }, [loadLevels]);

  /* ---------------------------------------------------------------- scan */

  const clearField = useCallback(() => {
    if (fieldRef.current) fieldRef.current.value = '';
    setSearch('');
  }, []);

  const focusField = useCallback(() => {
    // Redonne le focus sans le voler à un bouton que l'on vient de toucher.
    const a = document.activeElement as HTMLElement | null;
    if (!a || a.tagName === 'BODY') fieldRef.current?.focus();
  }, []);

  const addToCart = useCallback((p: PdaProduct, delta = 1) => {
    setCart((cur) => {
      const i = cur.findIndex((x) => x.product.id === p.id);
      if (i < 0) return [{ product: p, qty: Math.max(1, delta) }, ...cur];
      const next = [...cur];
      next[i] = { ...next[i]!, qty: Math.max(0, next[i]!.qty + delta) };
      // L'article scanné remonte en tête : on voit tout de suite l'effet.
      const [item] = next.splice(i, 1);
      return [item!, ...next];
    });
  }, []);

  /** Applique un article résolu, selon l'onglet actif. */
  const apply = useCallback((p: PdaProduct) => {
    if (tab === 'single') {
      setCurrent(p);
      setQty(1);
      setMessage(null);
    } else {
      addToCart(p, 1);
      setMessage({ text: `✓ ${p.name}`, tone: 'ok' });
    }
    clearField();
  }, [tab, addToCart, clearField]);

  /** Point d'entrée unique d'un code : correspondance exacte, sinon inconnu. */
  const handleCode = useCallback((code: string) => {
    const hit = index.get(normalizeCode(code));
    if (hit) { apply(hit); return; }
    clearField();
    setMessage({ text: `Article introuvable : « ${code} »`, tone: 'error' });
    onUnknownCode(code);
  }, [index, apply, clearField, onUnknownCode]);

  // Le pavé numérique prend le clavier à son compte : on suspend le scan.
  useScanner(handleCode, pad === null);

  /* --------------------------------------------------------- suggestions */

  const suggestions = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (s.length < 2) return [] as PdaProduct[];
    return products.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.barcode?.toLowerCase().includes(s) ?? false)
      || (p.sku?.toLowerCase().includes(s) ?? false)
      || (p.extra_barcodes?.some((b) => b.toLowerCase().includes(s)) ?? false),
    ).slice(0, 20);
  }, [products, search]);

  /* ---------------------------------------------------------- validation */

  async function validateSingle() {
    if (!current || qty < 1) return;
    setBusy(true);
    try {
      const r = await fetch('/api/stock/movement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: station.store_id, product_id: current.id,
          movement_type: 'purchase', quantity_delta: qty, reason: 'Entrée PDA',
        }),
      });
      if (r.ok) {
        notify(`+${qty} · ${current.name}`);
        setLevels((cur) => new Map(cur).set(current.id, (cur.get(current.id) ?? 0) + qty));
        setCurrent(null); setQty(1); setMessage(null);
        setTimeout(focusField, 30);
      } else {
        const j = await r.json().catch(() => ({}));
        setMessage({ text: j.error === 'FORBIDDEN' ? 'Droits insuffisants.' : "Échec de l'entrée.", tone: 'error' });
      }
    } finally { setBusy(false); }
  }

  async function validateBatch() {
    const items = cart.filter((x) => x.qty > 0);
    if (items.length === 0) return;
    setBusy(true);
    try {
      const r = await fetch('/api/stock/movement/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: station.store_id,
          movement_type: 'purchase',
          reason: 'Entrée multiple PDA',
          items: items.map((x) => ({ product_id: x.product.id, quantity_delta: x.qty })),
        }),
      });
      if (r.ok) {
        const total = items.reduce((s, x) => s + x.qty, 0);
        notify(`Entrée validée : ${items.length} article(s), ${total} unité(s).`);
        setCart([]); setMessage(null);
        void loadLevels();
        setTimeout(focusField, 30);
      } else {
        const j = await r.json().catch(() => ({}));
        setMessage({ text: j.error === 'FORBIDDEN' ? 'Droits insuffisants.' : "Échec de l'entrée.", tone: 'error' });
      }
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------ pavé qté */

  function openPad(target: 'single' | string, title: string, value: number) {
    setPad({ target, title });
    setPadValue(value > 0 ? String(value) : '');
  }
  function pressPad(k: string) {
    setPadValue((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      return next.length > 4 ? cur : next;
    });
  }
  function savePad() {
    if (!pad) return;
    const n = Math.max(0, parseInt(padValue || '0', 10) || 0);
    if (pad.target === 'single') setQty(Math.max(1, n));
    else if (n <= 0) setCart((cur) => cur.filter((x) => x.product.id !== pad.target));
    else setCart((cur) => cur.map((x) => (x.product.id === pad.target ? { ...x, qty: n } : x)));
    setPad(null);
    setTimeout(focusField, 30);
  }

  const totalUnits = cart.reduce((s, x) => s + x.qty, 0);

  /* -------------------------------------------------------------- rendu */

  return (
    <Screen>
      <Header title="Entrée de marchandise" onBack={onHome} onHome={onHome} />
      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setMessage(null); clearField(); setTimeout(focusField, 30); }}
        items={[{ value: 'single', label: 'Unitaire' }, { value: 'batch', label: 'Série (plusieurs)' }]}
      />

      <div className="shrink-0 p-3 bg-surface border-b border-border">
        <div className="text-xs text-ink-soft mb-1.5">
          {tab === 'single' ? 'Scanner un produit' : 'Scanner les produits (chaque scan = +1)'}
        </div>
        <ScanField
          inputRef={fieldRef}
          onSearch={setSearch}
          showClear={search.length > 0}
          placeholder="Scanner ou rechercher…"
        />
        {suggestions.length > 0 && (
          <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-surface">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button onClick={() => { apply(p); setTimeout(focusField, 30); }}
                        className="w-full text-left px-3 py-3 active:bg-gray-100">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-ink-soft truncate">{p.barcode ?? p.sku ?? 'Sans code'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ------------------------------------------------------- unitaire */}
      {tab === 'single' ? (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            {!current ? (
              <p className="pt-10 text-center text-sm text-ink-soft">
                Scannez un article pour commencer.
              </p>
            ) : (
              <>
                <ProductCard
                  name={current.name}
                  reference={current.barcode ?? current.sku}
                  extra={current.category_name ?? undefined}
                />
                <div>
                  <div className="text-xs text-ink-soft mb-1.5">Quantité</div>
                  <Stepper
                    value={qty}
                    min={1}
                    onChange={setQty}
                    onEdit={() => openPad('single', current.name, qty)}
                  />
                </div>
                <div className="card px-4 py-3 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Stock actuel</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {levels.has(current.id) ? levels.get(current.id) : '—'}
                  </span>
                </div>
                <div className="card px-4 py-3 flex items-baseline justify-between">
                  <span className="text-sm text-ink-soft">Après validation</span>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--primary-deep)' }}>
                    {levels.has(current.id) ? (levels.get(current.id) ?? 0) + qty : `+${qty}`}
                  </span>
                </div>
              </>
            )}
          </div>
          {message && <Toast message={message.text} tone={message.tone} />}
          <ActionBar>
            <button
              onClick={() => void validateSingle()}
              disabled={busy || !current}
              className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40"
            >
              {busy ? '…' : "Valider l'entrée"}
            </button>
          </ActionBar>
        </>
      ) : (
        /* ---------------------------------------------------------- série */
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {cart.length === 0 ? (
              <p className="pt-10 text-center text-sm text-ink-soft">
                Scannez un premier article pour démarrer la série.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map((it) => (
                  <li key={it.product.id} className="flex items-center gap-2 px-3 py-2.5 bg-surface">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{it.product.name}</div>
                      <div className="text-xs text-ink-soft truncate">
                        Réf. : {it.product.barcode ?? it.product.sku ?? '—'}
                      </div>
                      <button
                        onClick={() => openPad(it.product.id, it.product.name, it.qty)}
                        className="text-xs font-semibold mt-0.5"
                        style={{ color: 'var(--primary-deep)' }}
                      >
                        Qté : {it.qty}
                      </button>
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
            <div className="flex items-baseline justify-between text-sm mb-2">
              <span className="text-ink-soft">Total articles : <strong className="text-ink">{cart.length}</strong></span>
              <span className="text-ink-soft">Total quantité : <strong className="text-ink">{totalUnits}</strong></span>
            </div>
            <button
              onClick={() => void validateBatch()}
              disabled={busy || totalUnits === 0}
              className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40"
            >
              {busy ? '…' : "Valider l'entrée"}
            </button>
          </ActionBar>
        </>
      )}

      {pad && (
        <QtyPad
          title={pad.title}
          subtitle="Quantité à entrer"
          value={padValue}
          onKey={pressPad}
          onCancel={() => { setPad(null); setTimeout(focusField, 30); }}
          onSave={savePad}
        />
      )}
    </Screen>
  );
}
