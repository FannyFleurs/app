'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';
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

export default function LabelsManager() {
  const [items, setItems] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [selected, setSelected] = useState<LabelItem | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // Ordre "récent" : du plus récemment créé au plus ancien.
      const r = await fetch('/api/products?order=recent');
      if (r.ok) {
        const list = ((await r.json()).products as LabelItem[]).map((p) => ({
          ...p, sale_price_ttc: Number(p.sale_price_ttc),
        }));
        setItems(list);
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

  // Recherche exacte par code scanné (EAN puis SKU). Ouvre l'étiquette si trouvé.
  function handleScan(code: string) {
    setScanOpen(false);
    const c = code.trim();
    const hit = items.find((p) => p.barcode === c) ?? items.find((p) => p.sku === c);
    if (hit) { setNotFound(null); setSelected(hit); }
    else { setSelected(null); setNotFound(c); setQ(c); }
  }

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-4 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Étiquettes"
          subtitle="Imprimez une étiquette rapidement : recherche par nom, EAN ou référence, ou scan du code-barres."
        />
        <div className="mt-4 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Rechercher par nom, EAN ou référence…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setNotFound(null); }}
            autoFocus
          />
          <button className="btn-soft whitespace-nowrap" onClick={() => setScanOpen(true)}>
            📷 Scanner
          </button>
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
              <li key={p.id}>
                <button
                  onClick={() => { setNotFound(null); setSelected(p); }}
                  className="w-full text-left px-4 md:px-8 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
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
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <LabelPrintModal
          product={{
            name: selected.name,
            barcode: selected.barcode,
            sale_price_ttc: selected.sale_price_ttc,
            discount_type: selected.discount_type,
            discount_value: selected.discount_value,
          }}
          onClose={() => setSelected(null)}
        />
      )}
      {scanOpen && (
        <BarcodeScannerModal onClose={() => setScanOpen(false)} onScan={handleScan} />
      )}
    </div>
  );
}
