'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PdaProduct, Station } from './PdaApp';
import { printProductLabels } from './print-labels';
import { useScanField } from './scan';
import type { LabelSettings } from '@/lib/settings/label';
import {
  Screen, Header, ProductCard, ScanField, Stepper, QtyPad, ActionBar, Toast,
  IconChevron, IconPrinter,
} from './ui';

interface ReceptionSummary { id: string; filename: string | null; created_at: string; total: number; received: number }
interface ReceptionItem {
  product_id: string; name: string; sku: string | null; barcode: string | null;
  category_name: string | null; received_qty: number | null;
}

type View = 'receptions' | 'items' | 'quantity';

export default function PdaReceiving({
  station, products, settings, cloudPrinter, onHome, notify,
}: {
  station: Station; products: PdaProduct[]; settings: LabelSettings;
  cloudPrinter: string | null; onHome: () => void;
  notify: (text: string, tone?: 'ok' | 'error') => void;
}) {
  const [view, setView] = useState<View>('receptions');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [receptions, setReceptions] = useState<ReceptionSummary[]>([]);
  const [reception, setReception] = useState<ReceptionSummary | null>(null);
  const [items, setItems] = useState<ReceptionItem[]>([]);
  const [item, setItem] = useState<ReceptionItem | null>(null);
  const [qty, setQty] = useState(1);
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [validated, setValidated] = useState(false);
  const [movementDone, setMovementDone] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [printing, setPrinting] = useState(false);
  const [pad, setPad] = useState(false);
  const [padValue, setPadValue] = useState('');

  const barcodeField = useScanField({
    onCode: (code) => setBarcode(code),
    enabled: view === 'quantity' && !!item && item.barcode === null && !validated,
  });

  const loadReceptions = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/pda/receptions?store_id=${encodeURIComponent(station.store_id)}`, { cache: 'no-store' });
      if (r.ok) setReceptions((await r.json()).receptions as ReceptionSummary[]);
    } finally { setLoading(false); }
  }, [station.store_id]);
  useEffect(() => { void loadReceptions(); }, [loadReceptions]);

  const loadLevels = useCallback(async () => {
    try {
      const r = await fetch(`/api/stock/levels?store_id=${encodeURIComponent(station.store_id)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const rows = (await r.json()).levels as Array<{ product_id: string; quantity: string }>;
      setLevels(new Map(rows.map((x) => [x.product_id, Number(x.quantity)])));
    } catch { /* niveau inconnu : on n'affiche simplement rien */ }
  }, [station.store_id]);
  useEffect(() => { void loadLevels(); }, [loadLevels]);

  async function openReception(r: ReceptionSummary) {
    setReception(r); setLoading(true); setView('items');
    try {
      const res = await fetch(`/api/pda/receptions/${r.id}/items`, { cache: 'no-store' });
      if (res.ok) setItems((await res.json()).items as ReceptionItem[]);
    } finally { setLoading(false); }
  }

  function openItem(it: ReceptionItem) {
    setItem(it); setQty(1); setValidated(false); setMovementDone(false);
    setBarcode(''); barcodeField.clear(); setMessage(null); setView('quantity');
  }

  async function validate() {
    if (!item || !reception || qty < 1) return;
    setBusy(true);
    try {
      if (!movementDone) {
        const r = await fetch('/api/stock/movement', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id: station.store_id, product_id: item.product_id,
            movement_type: 'purchase', quantity_delta: qty,
            reason: `Réception${reception.filename ? ` · ${reception.filename}` : ''}`,
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setMessage({ text: j.error === 'FORBIDDEN' ? 'Droits insuffisants.' : "Échec de l'entrée.", tone: 'error' });
          return;
        }
        setMovementDone(true);
      }

      const payload: { product_id: string; received_qty: number; barcode?: string } = {
        product_id: item.product_id, received_qty: qty,
      };
      // Code-barres saisi maintenant uniquement si l'article n'en avait pas déjà un.
      if (item.barcode === null && barcode.trim()) payload.barcode = barcode.trim();

      const r2 = await fetch(`/api/pda/receptions/${reception.id}/items`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r2.ok) {
        const j = await r2.json().catch(() => ({}));
        const text = j.error === 'BARCODE_ALREADY_USED'
          ? 'Ce code-barres est déjà utilisé par un autre article.'
          : j.error === 'BARCODE_ALREADY_SET'
          ? 'Cet article a déjà un code-barres.'
          : "Échec de l'enregistrement de la réception.";
        setMessage({ text, tone: 'error' });
        return;
      }

      const savedBarcode = payload.barcode ?? item.barcode;
      setLevels((cur) => new Map(cur).set(item.product_id, (cur.get(item.product_id) ?? 0) + qty));
      setItems((cur) => cur.map((x) => (
        x.product_id === item.product_id ? { ...x, received_qty: qty, barcode: savedBarcode } : x
      )));
      setItem((cur) => (cur ? { ...cur, barcode: savedBarcode } : cur));
      setValidated(true);
    } finally { setBusy(false); }
  }

  async function printReceived() {
    if (!item) return;
    const full = products.find((p) => p.id === item.product_id);
    setPrinting(true);
    try {
      const res = await printProductLabels({
        product: full ?? { name: item.name, sku: item.sku, barcode: item.barcode, sale_price_ttc: 0 },
        qty, settings, cloudPrinter, storeId: station.store_id,
      });
      if (res.ok) notify(res.message);
      else setMessage({ text: res.message, tone: 'error' });
    } finally { setPrinting(false); }
  }

  function backToItems() {
    setItem(null); setView('items');
    const remaining = items.filter((x) => x.received_qty === null).length;
    if (remaining === 0) { setReception(null); setView('receptions'); void loadReceptions(); }
  }

  function savePad() {
    const n = Math.max(1, parseInt(padValue || '0', 10) || 1);
    setQty(n); setPad(false);
  }
  function pressPad(k: string) {
    setPadValue((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      return next.length > 4 ? cur : next;
    });
  }

  // --- vue : receptions (liste des réceptions envoyées au PDA) ---
  if (view === 'receptions') {
    return (
      <Screen>
        <Header title="Nouvelle réception" onBack={onHome} onHome={onHome} />
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {loading ? <p className="pt-10 text-center text-sm text-ink-soft">Chargement…</p>
          : receptions.length === 0 ? (
            <div className="pt-10 text-center text-sm text-ink-soft px-4">
              Aucune réception en attente.
              <p className="mt-2 text-xs">
                Seules les réceptions envoyées au PDA (import avec l&apos;option « Envoyer cet import au PDA », ou réception créée depuis Paramètres → Réceptions) apparaissent ici.
              </p>
            </div>
          ) : (
            receptions.map((r) => (
              <button key={r.id} onClick={() => void openReception(r)}
                className="card w-full p-3.5 text-left active:scale-[0.99] transition-transform">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight truncate">{r.filename ?? 'Réception manuelle'}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{new Date(r.created_at).toLocaleDateString('fr-FR')}</div>
                  </div>
                  <span className="shrink-0 text-ink-soft"><IconChevron /></span>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="font-semibold" style={{ color: 'var(--primary-deep)' }}>
                    {r.received} / {r.total} articles reçus
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
                  <div className="h-full" style={{ width: `${r.total > 0 ? Math.round((r.received / r.total) * 100) : 0}%`, backgroundColor: 'var(--primary-deep)' }} />
                </div>
              </button>
            ))
          )}
        </div>
      </Screen>
    );
  }

  // --- vue : items (articles de la réception choisie) ---
  if (view === 'items' && reception) {
    const pending = items.filter((x) => x.received_qty === null);
    const done = items.filter((x) => x.received_qty !== null);
    return (
      <Screen>
        <Header title={reception.filename ?? 'Réception'} onBack={() => { setView('receptions'); void loadReceptions(); }} onHome={onHome} />
        <div className="shrink-0 px-3.5 py-3 bg-surface border-b border-border">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{done.length} / {items.length} articles réceptionnés</span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-border overflow-hidden">
            <div className="h-full" style={{ width: `${items.length > 0 ? Math.round((done.length / items.length) * 100) : 0}%`, backgroundColor: 'var(--primary-deep)' }} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {loading ? <p className="pt-10 text-center text-sm text-ink-soft">Chargement…</p> : (
            <>
              {pending.map((it) => (
                <button key={it.product_id} onClick={() => openItem(it)}
                  className="card w-full flex items-center gap-3 p-3 text-left active:scale-[0.99] transition-transform">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold leading-tight truncate">{it.name}</div>
                    <div className="text-xs text-ink-soft truncate">Réf. : {it.barcode ?? it.sku ?? '—'}</div>
                  </div>
                  <span className="shrink-0 text-ink-soft"><IconChevron /></span>
                </button>
              ))}
              {done.length > 0 && (
                <>
                  <div className="pt-2 px-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--primary-deep)' }}>
                    Déjà réceptionnés
                  </div>
                  {done.map((it) => (
                    <div key={it.product_id} className="card flex items-center gap-3 p-3 opacity-55">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold leading-tight truncate line-through">{it.name}</div>
                        <div className="text-xs text-ink-soft truncate">reçu : {it.received_qty}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </Screen>
    );
  }

  // --- vue : quantité (fiche article + code-barres + validation + impression) ---
  if (view === 'quantity' && item && reception) {
    return (
      <Screen>
        <Header title={item.name} onBack={() => setView('items')} onHome={onHome} />
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <ProductCard name={item.name} reference={item.barcode ?? item.sku} extra={item.category_name ?? undefined} />
          {!validated && item.barcode === null && (
            <div>
              <div className="text-xs text-ink-soft mb-1.5">Code-barres (facultatif — l&apos;article n&apos;en a pas encore)</div>
              <ScanField field={barcodeField} placeholder="Scanner ou saisir le code…" showClear />
              {barcode && (
                <div className="mt-1.5 text-xs font-semibold" style={{ color: 'var(--primary-deep)' }}>
                  Code saisi : {barcode}
                </div>
              )}
            </div>
          )}
          {!validated && (
            <div>
              <div className="text-xs text-ink-soft mb-1.5">Quantité reçue</div>
              <Stepper value={qty} min={1} onChange={setQty} onEdit={() => { setPadValue(String(qty)); setPad(true); }} />
            </div>
          )}
          <div className="card px-4 py-3 flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">Stock actuel</span>
            <span className="text-sm font-semibold tabular-nums">
              {levels.has(item.product_id) ? levels.get(item.product_id) : '—'}
            </span>
          </div>
          {!validated && (
            <div className="card px-4 py-3 flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">Après validation</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--primary-deep)' }}>
                {levels.has(item.product_id) ? (levels.get(item.product_id) ?? 0) + qty : `+${qty}`}
              </span>
            </div>
          )}
          {validated && (
            <div className="rounded-xl px-4 py-3 text-sm font-semibold text-center" style={{ backgroundColor: 'rgba(14,107,92,0.1)', color: '#0E6B5C' }}>
              ✓ Réception enregistrée
            </div>
          )}
        </div>
        {message && <Toast message={message.text} tone={message.tone} />}
        <ActionBar>
          {!validated ? (
            <button onClick={() => void validate()} disabled={busy}
              className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40">
              {busy ? '…' : 'Valider la réception'}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => void printReceived()} disabled={printing}
                className="btn-soft h-12 w-full text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
                <IconPrinter />
                {printing ? '…' : `Imprimer ${qty} étiquette${qty > 1 ? 's' : ''}`}
              </button>
              <button type="button" onClick={backToItems} className="btn-ghost mt-2 h-10 w-full text-sm">
                ← Article suivant
              </button>
            </>
          )}
        </ActionBar>
        {pad && (
          <QtyPad title={item.name} subtitle="Quantité reçue" value={padValue}
            onKey={pressPad} onCancel={() => setPad(false)} onSave={savePad} />
        )}
      </Screen>
    );
  }

  return null;
}
