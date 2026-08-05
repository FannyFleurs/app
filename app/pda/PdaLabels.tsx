'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PdaProduct, Station } from './PdaApp';
import { useCodeIndex, useScanField, normalizeCode } from './scan';
import { formatEUR } from '@/lib/services/money';
import { discountedPrice } from '@/lib/services/label-print';
import { printProductLabels } from './print-labels';
import type { LabelSettings } from '@/lib/settings/label';
import {
  Screen, Header, ScanField, ProductCard, Stepper, QtyPad, ActionBar, Toast, IconPrinter,
} from './ui';

/**
 * Impression d'étiquettes produit.
 *
 * On scanne un article, on choisit le nombre d'étiquettes, on imprime. Si une
 * imprimante réseau (CloudPRNT) est déclarée avec le rôle « étiquette », le
 * travail lui est envoyé directement ; sinon on ouvre la fenêtre d'impression
 * du navigateur.
 */
export default function PdaLabels({
  station, products, settings, cloudPrinter, onUnknownCode, onEdit, canWrite, onHome, notify,
}: {
  station: Station;
  products: PdaProduct[];
  settings: LabelSettings;
  cloudPrinter: string | null;
  onUnknownCode: (code: string) => void;
  onEdit: (p: PdaProduct) => void;
  canWrite: boolean;
  onHome: () => void;
  notify: (text: string, tone?: 'ok' | 'error') => void;
}) {
  const [current, setCurrent] = useState<PdaProduct | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [pad, setPad] = useState(false);
  const [padValue, setPadValue] = useState('');

  const index = useCodeIndex(products);

  const apply = useCallback((p: PdaProduct) => {
    setCurrent(p);
    setCount(1);
    setMessage(null);
  }, []);

  const handleCode = useCallback((code: string) => {
    const hit = index.get(normalizeCode(code));
    if (hit) { apply(hit); return; }
    setMessage({ text: `Article introuvable : « ${code} »`, tone: 'error' });
    onUnknownCode(code);
  }, [index, apply, onUnknownCode]);

  const field = useScanField({
    onCode: handleCode,
    onSearch: setSearch,
    canResolve: (c) => index.has(normalizeCode(c)),
    enabled: !pad,
  });
  const { focus: focusField } = field;

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

  async function print() {
    if (!current || count < 1) return;
    setBusy(true);
    try {
      const res = await printProductLabels({
        product: current, qty: count, settings, cloudPrinter, storeId: station.store_id,
      });
      if (res.ok) {
        notify(res.message);
        setCurrent(null); setCount(1);
        setTimeout(focusField, 30);
      } else {
        setMessage({ text: res.message, tone: 'error' });
      }
    } finally { setBusy(false); }
  }

  const promo = current ? discountedPrice(current) : null;

  return (
    <Screen>
      <Header title="Imprimer étiquettes" onBack={onHome} onHome={onHome} />

      <div className="shrink-0 p-3 bg-surface border-b border-border">
        <div className="text-xs text-ink-soft mb-1.5">Scanner un produit</div>
        <ScanField field={field} showClear={search.length > 0} />
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

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {!current ? (
          <p className="pt-10 text-center text-sm text-ink-soft">
            Scannez un article pour imprimer ses étiquettes.
          </p>
        ) : (
          <>
            <ProductCard
              name={current.name}
              reference={current.barcode ?? current.sku}
              extra={current.category_name ?? undefined}
              right={
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">
                    {formatEUR(promo ?? current.sale_price_ttc)}
                  </span>
                  {promo != null && (
                    <span className="block text-xs text-ink-soft line-through tabular-nums">
                      {formatEUR(current.sale_price_ttc)}
                    </span>
                  )}
                </span>
              }
            />

            <div>
              <div className="text-xs text-ink-soft mb-1.5">Nombre d&apos;étiquettes</div>
              <Stepper
                value={count}
                min={1}
                max={200}
                onChange={setCount}
                onEdit={() => { setPad(true); setPadValue(String(count)); }}
              />
            </div>

            <div className="card divide-y divide-border">
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-sm text-ink-soft">Format d&apos;étiquette</span>
                <span className="text-sm font-medium tabular-nums">
                  {settings.width_mm} × {settings.height_mm} mm
                </span>
              </div>
              <div className="flex items-baseline justify-between px-4 py-3">
                <span className="text-sm text-ink-soft">Imprimante</span>
                <span className="text-sm font-medium text-right truncate">
                  {cloudPrinter ?? 'Impression navigateur'}
                </span>
              </div>
            </div>

            {canWrite && (
              <button onClick={() => onEdit(current)} className="btn-soft h-12 w-full">
                Modifier la fiche article
              </button>
            )}
          </>
        )}
      </div>

      {message && <Toast message={message.text} tone={message.tone} />}

      <ActionBar>
        <button
          onClick={() => void print()}
          disabled={busy || !current}
          className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
        >
          <IconPrinter />
          {busy ? '…' : 'Imprimer'}
        </button>
      </ActionBar>

      {pad && (
        <QtyPad
          title={current?.name ?? 'Étiquettes'}
          subtitle="Nombre d'étiquettes"
          value={padValue}
          onKey={(k) => setPadValue((cur) => {
            if (k === 'C') return '';
            if (k === '⌫') return cur.slice(0, -1);
            const next = (cur + k).replace(/^0+(?=\d)/, '');
            return next.length > 3 ? cur : next;
          })}
          onCancel={() => { setPad(false); setTimeout(focusField, 30); }}
          onSave={() => {
            const n = Math.min(200, Math.max(1, parseInt(padValue || '1', 10) || 1));
            setCount(n); setPad(false); setTimeout(focusField, 30);
          }}
        />
      )}
    </Screen>
  );
}
