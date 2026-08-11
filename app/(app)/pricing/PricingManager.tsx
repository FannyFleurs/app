'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { round2 } from '@/lib/services/money';

interface ApiProduct {
  id: string;
  name: string;
  category_id: string | null;
  sale_price_ttc: number;
  purchase_price_ht: number | null;
  transport_cost_ht: number | null;
  tax_rate: number;
}

interface Category { id: string; name: string; transport_cost_ht: number; transport_cost_pct: number | null }

/** Ligne éditable en mémoire. */
interface Row {
  id: string;
  name: string;
  purchase: string;   // prix d'achat HT (texte)
  transport: string;  // coût de transport HT (texte) — effectif
  coef: string;       // coefficient multiplicateur = vente TTC / achat HT
  sale: string;       // prix de vente TTC (texte)
  tax_rate: number;
  catTransport: number; // défaut de la catégorie (pour savoir si surcharge)
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}

function parseNum(s: string): number {
  const n = Number(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

function toRow(p: ApiProduct, catTransport: number): Row {
  const purchase = p.purchase_price_ht ?? 0;
  const sale = p.sale_price_ttc ?? 0;
  const coef = purchase > 0 ? round2(sale / purchase) : 0;
  // Transport effectif : surcharge article si définie, sinon défaut catégorie.
  const transport = p.transport_cost_ht != null ? Number(p.transport_cost_ht) : catTransport;
  return {
    id: p.id,
    name: p.name,
    purchase: purchase ? String(purchase) : '',
    transport: transport ? String(transport) : '',
    coef: coef ? String(coef) : '',
    sale: sale ? String(sale) : '',
    tax_rate: p.tax_rate,
    catTransport,
    dirty: false, saving: false, saved: false,
  };
}

export default function PricingManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [catId, setCatId] = useState<string>('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [rc, rp] = await Promise.all([
        fetch('/api/categories'),
        fetch('/api/products'),
      ]);
      if (rc.ok) {
        setCategories(((await rc.json()).categories as Category[]).map((c) => ({
          ...c,
          transport_cost_ht: Number(c.transport_cost_ht ?? 0),
          transport_cost_pct: c.transport_cost_pct != null ? Number(c.transport_cost_pct) : null,
        })));
      }
      if (rp.ok) {
        const list = ((await rp.json()).products as ApiProduct[]).map((p) => ({
          ...p,
          sale_price_ttc: Number(p.sale_price_ttc),
          purchase_price_ht: p.purchase_price_ht != null ? Number(p.purchase_price_ht) : null,
          transport_cost_ht: p.transport_cost_ht != null ? Number(p.transport_cost_ht) : null,
          tax_rate: Number(p.tax_rate),
        }));
        setProducts(list);
      }
      setLoading(false);
    })();
  }, []);

  // Transport effectif par défaut de la catégorie : % du prix d'achat si un
  // pourcentage est défini, sinon le montant fixe.
  const catTransport = (cid: string | null, purchase: number) => {
    const c = categories.find((x) => x.id === cid);
    if (!c) return 0;
    if (c.transport_cost_pct != null) return round2((purchase * c.transport_cost_pct) / 100);
    return c.transport_cost_ht ?? 0;
  };

  // Prépare les lignes éditables dès qu'une catégorie est choisie.
  const visible = useMemo(
    () => (catId ? products.filter((p) => p.category_id === catId) : []),
    [products, catId],
  );
  useEffect(() => {
    const next: Record<string, Row> = {};
    for (const p of visible) next[p.id] = rows[p.id] ?? toRow(p, catTransport(p.category_id, Number(p.purchase_price_ht ?? 0)));
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catId, products, categories]);

  function patchRow(id: string, changes: Partial<Row>) {
    setRows((cur) => ({ ...cur, [id]: { ...cur[id]!, ...changes, dirty: true, saved: false } }));
  }
  // Change achat → recalcule la vente à coef constant.
  function onPurchase(id: string, v: string) {
    const r = rows[id]!;
    const purchase = parseNum(v);
    const coef = parseNum(r.coef);
    const sale = coef > 0 ? round2(purchase * coef) : parseNum(r.sale);
    patchRow(id, { purchase: v, sale: sale ? String(sale) : r.sale });
  }
  // Change coef → recalcule la vente.
  function onCoef(id: string, v: string) {
    const r = rows[id]!;
    const purchase = parseNum(r.purchase);
    const coef = parseNum(v);
    const sale = purchase > 0 ? round2(purchase * coef) : parseNum(r.sale);
    patchRow(id, { coef: v, sale: sale ? String(sale) : r.sale });
  }
  // Change vente → recalcule le coef.
  function onSale(id: string, v: string) {
    const r = rows[id]!;
    const purchase = parseNum(r.purchase);
    const sale = parseNum(v);
    const coef = purchase > 0 ? round2(sale / purchase) : 0;
    patchRow(id, { sale: v, coef: coef ? String(coef) : r.coef });
  }
  // Change transport → n'impacte que la marge.
  function onTransport(id: string, v: string) {
    patchRow(id, { transport: v });
  }

  async function save(id: string) {
    const r = rows[id]!;
    setRows((cur) => ({ ...cur, [id]: { ...cur[id]!, saving: true } }));
    // Transport : surcharge article seulement si différent du défaut catégorie
    // (sinon null = hérite, pour que les changements de catégorie se propagent).
    const tval = parseNum(r.transport);
    const transportOverride = Math.abs(tval - r.catTransport) < 0.0001 ? null : tval;
    const res = await fetch(`/api/products/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: r.name.trim(),
        purchase_price_ht: parseNum(r.purchase) > 0 ? parseNum(r.purchase) : null,
        transport_cost_ht: transportOverride,
        sale_price_ttc: parseNum(r.sale),
      }),
    });
    setRows((cur) => ({
      ...cur,
      [id]: { ...cur[id]!, saving: false, dirty: !res.ok, saved: res.ok },
    }));
    if (res.ok) {
      // Met à jour la source pour rester cohérent si on rebascule de catégorie.
      setProducts((cur) => cur.map((p) => (p.id === id
        ? { ...p, name: r.name.trim(), purchase_price_ht: parseNum(r.purchase) || null, transport_cost_ht: transportOverride, sale_price_ttc: parseNum(r.sale) }
        : p)));
      setTimeout(() => setRows((cur) => (cur[id] ? { ...cur, [id]: { ...cur[id]!, saved: false } } : cur)), 2000);
    }
  }

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Gestion de prix"
          subtitle="Ajustez achat, coefficient et prix de vente article par article. Le coefficient = prix de vente TTC ÷ prix d'achat HT."
          actions={(
            <label className="text-sm">
              <span className="sr-only">Catégorie</span>
              <select className="input h-10 min-w-[12rem]" value={catId} onChange={(e) => setCatId(e.target.value)}>
                <option value="">— Choisir une catégorie —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
        />
      </div>

      <div className="flex-1 md:overflow-y-auto px-4 md:px-8 py-4">
        {loading ? (
          <p className="text-sm text-ink-soft">Chargement…</p>
        ) : !catId ? (
          <p className="text-sm text-ink-soft">Choisissez une catégorie pour afficher ses articles.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-ink-soft">Aucun article dans cette catégorie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-ink-soft border-b border-border">
                  <th className="py-2 pr-3">Article</th>
                  <th className="py-2 px-2 text-right w-28">Achat HT</th>
                  <th className="py-2 px-2 text-right w-28">Transport HT</th>
                  <th className="py-2 px-2 text-right w-24">Coef</th>
                  <th className="py-2 px-2 text-right w-28">Vente TTC</th>
                  <th className="py-2 px-2 text-right w-32">Marge HT</th>
                  <th className="py-2 pl-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const r = rows[p.id];
                  if (!r) return null;
                  const purchase = parseNum(r.purchase);
                  const transport = parseNum(r.transport);
                  const saleTtc = parseNum(r.sale);
                  const saleHt = saleTtc / (1 + r.tax_rate / 100);
                  const margeHt = round2(saleHt - purchase - transport);
                  const marquePct = saleHt > 0 ? Math.round((margeHt / saleHt) * 100) : 0;
                  return (
                    <tr key={p.id} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">
                        <input className="input h-9 w-full" value={r.name}
                               onChange={(e) => patchRow(p.id, { name: e.target.value })} />
                      </td>
                      <td className="py-1.5 px-2">
                        <input className="input h-9 w-full text-right tabular-nums" inputMode="decimal"
                               value={r.purchase} onChange={(e) => onPurchase(p.id, e.target.value)} placeholder="0" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input className="input h-9 w-full text-right tabular-nums" inputMode="decimal"
                               value={r.transport} onChange={(e) => onTransport(p.id, e.target.value)}
                               placeholder={r.catTransport ? String(r.catTransport) : '0'} />
                      </td>
                      <td className="py-1.5 px-2">
                        <input className="input h-9 w-full text-right tabular-nums" inputMode="decimal"
                               value={r.coef} onChange={(e) => onCoef(p.id, e.target.value)} placeholder="—" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input className="input h-9 w-full text-right tabular-nums font-medium" inputMode="decimal"
                               value={r.sale} onChange={(e) => onSale(p.id, e.target.value)} placeholder="0" />
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        <span className={margeHt >= 0 ? 'text-success' : 'text-danger'}>{fmt(margeHt)} €</span>
                        <span className="text-ink-soft text-xs ml-1">({marquePct}%)</span>
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <button
                          onClick={() => void save(p.id)}
                          disabled={!r.dirty || r.saving}
                          title="Enregistrer cette ligne"
                          className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors ${
                            r.saved ? 'bg-success text-white'
                            : r.dirty ? 'btn-primary' : 'bg-gray-100 text-ink-soft cursor-default'
                          }`}
                        >
                          {r.saving ? '…' : r.saved ? '✓' : '✓'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-soft">
              Achat HT × coefficient = vente TTC. Modifier l&apos;un recalcule l&apos;autre.
              Marge HT = vente HT − achat HT − transport HT (taux de marque entre parenthèses).
              Le transport est pré-rempli avec le défaut de la catégorie (Réglages → Coûts de transport).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
