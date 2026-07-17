'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';
import { buildLabelsDocument, openPrintWindow } from '@/lib/services/label-print';
import { LABEL_DEFAULTS, type LabelSettings } from '@/lib/settings/label';
import LabelPrintModal from '../products/LabelPrintModal';

const BarcodeScannerModal = dynamic(() => import('../caisse/BarcodeScannerModal'), { ssr: false });

interface LabelItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  sale_price_ttc: number;
  discount_type: 'percent' | 'amount' | null;
  discount_value: number | null;
}

interface BatchLine { product: LabelItem; qty: number }

export default function LabelsManager() {
  const [items, setItems] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [scanOpen, setScanOpen] = useState(false);        // scan → impression unitaire
  const [scanBatchOpen, setScanBatchOpen] = useState(false); // scan continu → liste
  const [selected, setSelected] = useState<LabelItem | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  // Impression rapide (lot)
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const [settings, setSettings] = useState<LabelSettings>(LABEL_DEFAULTS);
  // Imprimante CloudPRNT active (impression directe) : null si aucune.
  const [cloudPrinter, setCloudPrinter] = useState<string | null>(null);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [rp, rs, rc] = await Promise.all([
        fetch('/api/products?order=recent'),
        fetch('/api/settings/labels'),
        fetch('/api/cloudprnt/printers'),
      ]);
      if (rp.ok) {
        const list = ((await rp.json()).products as LabelItem[]).map((p) => ({
          ...p, sale_price_ttc: Number(p.sale_price_ttc),
        }));
        setItems(list);
      }
      if (rs.ok) setSettings((await rs.json()).settings as LabelSettings);
      if (rc.ok) {
        const printers = (await rc.json()).printers as Array<{ label: string; role: string; enabled: boolean }>;
        const p = printers.find((x) => x.role === 'label' && x.enabled);
        setCloudPrinter(p ? p.label : null);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((p) =>
      p.name.toLowerCase().includes(s)
      || (p.barcode ?? '').toLowerCase().includes(s)
      || (p.sku ?? '').toLowerCase().includes(s),
    );
  }, [items, q]);

  function findByCode(code: string): LabelItem | undefined {
    const c = code.trim();
    return items.find((p) => p.barcode === c) ?? items.find((p) => p.sku === c);
  }

  // Scan → impression unitaire (ouvre la modale).
  function handleScanSingle(code: string) {
    setScanOpen(false);
    const hit = findByCode(code);
    if (hit) { setNotFound(null); setSelected(hit); }
    else { setSelected(null); setNotFound(code); setQ(code); }
  }

  function addProductToBatch(hit: LabelItem) {
    setNotFound(null);
    setBatch((cur) => {
      const idx = cur.findIndex((e) => e.product.id === hit.id);
      if (idx >= 0) {
        const next = [...cur];
        next[idx] = { ...next[idx]!, qty: next[idx]!.qty + 1 };
        return next;
      }
      return [...cur, { product: hit, qty: 1 }];
    });
  }
  // Scan continu → ajoute à la liste (le scanner reste ouvert).
  function addToBatch(code: string) {
    const hit = findByCode(code);
    if (!hit) { setNotFound(code); return; }
    addProductToBatch(hit);
  }
  function setBatchQty(id: string, delta: number) {
    setBatch((cur) => cur
      .map((e) => (e.product.id === id ? { ...e, qty: Math.max(0, e.qty + delta) } : e))
      .filter((e) => e.qty > 0));
  }
  function removeBatch(id: string) {
    setBatch((cur) => cur.filter((e) => e.product.id !== id));
  }
  function batchEntries() {
    return batch.map((e) => ({
      product: {
        name: e.product.name,
        sku: e.product.sku,
        barcode: e.product.barcode,
        sale_price_ttc: e.product.sale_price_ttc,
        discount_type: e.product.discount_type,
        discount_value: e.product.discount_value,
      },
      qty: e.qty,
    }));
  }
  function printBatch() {
    openPrintWindow(buildLabelsDocument(batchEntries(), settings));
  }
  async function printBatchCloud() {
    setCloudMsg(null);
    const r = await fetch('/api/cloudprnt/print-labels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: batchEntries() }),
    });
    if (r.ok) {
      const j = await r.json();
      setCloudMsg(`${j.count} étiquette(s) envoyée(s) à « ${j.printer} ».`);
      setBatch([]);
      setTimeout(() => setCloudMsg(null), 4000);
    } else {
      const j = await r.json().catch(() => null);
      setCloudMsg(j?.error === 'NO_PRINTER' ? 'Aucune imprimante CloudPRNT active.' : 'Échec de l’envoi à l’imprimante.');
    }
  }

  const batchTotal = batch.reduce((s, e) => s + e.qty, 0);

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Étiquettes"
          subtitle="Imprimez une étiquette rapidement : recherche par nom, EAN ou référence, ou scan du code-barres."
        />
      </div>

      {/* Impression rapide : scan continu → lot → impression groupée */}
      <div className="px-4 md:px-8 py-4 shrink-0 border-b border-border bg-bg/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-sm">⚡ Impression rapide</div>
            <p className="text-xs text-ink-soft">Scannez les articles à la suite, ajustez les quantités, imprimez tout d&apos;un coup.</p>
          </div>
          <button className="btn-soft whitespace-nowrap" onClick={() => setScanBatchOpen(true)}>📷 Scanner en continu</button>
        </div>

        {batch.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-white divide-y divide-border">
            {batch.map((e) => (
              <div key={e.product.id} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{e.product.name}</div>
                  <div className="text-xs text-ink-soft font-mono truncate">{e.product.barcode || e.product.sku || '— pas de code —'}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="h-9 w-9 rounded-lg border border-border text-lg font-semibold hover:bg-gray-50"
                          onClick={() => setBatchQty(e.product.id, -1)}>−</button>
                  <span className="w-10 text-center tabular-nums font-semibold">{e.qty}</span>
                  <button className="h-9 w-9 rounded-lg border border-border text-lg font-semibold hover:bg-gray-50"
                          onClick={() => setBatchQty(e.product.id, +1)}>+</button>
                </div>
                <button className="ml-1 text-ink-soft hover:text-danger text-lg leading-none px-1"
                        title="Retirer" onClick={() => removeBatch(e.product.id)}>✕</button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 px-3 py-2 flex-wrap">
              <button className="text-xs text-ink-soft hover:text-danger" onClick={() => setBatch([])}>Vider la liste</button>
              <div className="flex items-center gap-2">
                {cloudPrinter ? (
                  <>
                    <button className="btn-soft" onClick={printBatch} title="Via la boîte d'impression du navigateur">
                      PDF / navigateur
                    </button>
                    <button className="btn-primary" onClick={() => void printBatchCloud()}>
                      🖨 Imprimer sur « {cloudPrinter} » ({batchTotal})
                    </button>
                  </>
                ) : (
                  <button className="btn-primary" onClick={printBatch}>
                    Imprimer tout ({batchTotal} étiquette{batchTotal > 1 ? 's' : ''})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {cloudMsg && <p className="mt-2 text-xs text-accent-deep">{cloudMsg}</p>}
      </div>

      {/* Recherche + liste (impression unitaire) */}
      <div className="px-4 md:px-8 py-3 shrink-0 border-b border-border">
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Rechercher par nom, EAN ou référence…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setNotFound(null); }}
          />
          <button className="btn-soft whitespace-nowrap" onClick={() => setScanOpen(true)}>📷 Scanner</button>
        </div>
        {notFound && (
          <div className="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
            Aucun article trouvé pour « {notFound} ».
          </div>
        )}
      </div>

      <div className="flex-1 md:overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-ink-soft">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-ink-soft/70">Aucun article.</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id} className="flex items-center">
                <button
                  onClick={() => { setNotFound(null); setSelected(p); }}
                  className="flex-1 text-left px-4 md:px-8 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 min-w-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="mt-0.5 text-xs text-ink-soft font-mono truncate">
                      {p.barcode || p.sku || '— pas de code —'}
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums whitespace-nowrap">
                    {formatEUR(p.sale_price_ttc)}
                  </div>
                  <span className="text-ink-soft text-lg" aria-hidden>🏷️</span>
                </button>
                <button
                  className="px-3 md:px-4 py-3 text-xs text-ink-soft hover:text-ink whitespace-nowrap"
                  title="Ajouter à l'impression rapide"
                  onClick={() => addProductToBatch(p)}
                >
                  + lot
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <LabelPrintModal
          product={{
            name: selected.name,
            sku: selected.sku,
            barcode: selected.barcode,
            sale_price_ttc: selected.sale_price_ttc,
            discount_type: selected.discount_type,
            discount_value: selected.discount_value,
          }}
          onClose={() => setSelected(null)}
        />
      )}
      {scanOpen && (
        <BarcodeScannerModal onClose={() => setScanOpen(false)} onScan={handleScanSingle} />
      )}
      {scanBatchOpen && (
        <BarcodeScannerModal onClose={() => setScanBatchOpen(false)} onScan={addToBatch} />
      )}
    </div>
  );
}
