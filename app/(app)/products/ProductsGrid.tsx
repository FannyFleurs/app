'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Vue liste éditable du catalogue : un tableau où chaque cellule se modifie
 * à la volée (nom, catégorie, TVA, prix d'achat/vente, SKU, code-barres,
 * visibilité, actif). Chaque changement est enregistré individuellement via
 * PATCH /api/products/:id. Pensé pour retoucher rapidement une série
 * d'articles sans ouvrir chaque fiche.
 */

interface Row {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  category_name: string | null;
  tax_rate_id: string;
  tax_rate: number;
  tax_rate_code: string;
  sale_price_ttc: number;
  purchase_price_ht: number | null;
  price_is_free: boolean;
  visible_in_pos: boolean;
  is_active: boolean;
}

type TaxRate = { id: string; code: string; rate: number; label: string; is_default: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type SortKey = 'name' | 'price' | 'margin' | 'category';

/** Taux de marge d'une ligne : (vente HT − achat) / vente HT. */
function marginPct(r: Row): number | null {
  const ht = r.sale_price_ttc / (1 + r.tax_rate / 100);
  if (!(ht > 0) || r.purchase_price_ht == null) return null;
  return ((ht - r.purchase_price_ht) / ht) * 100;
}

function euro(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ProductsGrid({
  canEdit, taxRates, categories,
}: {
  canEdit: boolean;
  taxRates: TaxRate[];
  categories: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Filtres
  const [q, setQ] = useState('');
  const [fCat, setFCat] = useState('all');
  const [fTax, setFTax] = useState('all');
  const [minP, setMinP] = useState('');
  const [maxP, setMaxP] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [save, setSave] = useState<Record<string, SaveState>>({});
  const savedTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  async function reload() {
    setLoading(true);
    const params = new URLSearchParams();
    if (showInactive) params.set('active', 'false');
    const r = await fetch(`/api/products?${params.toString()}`);
    if (r.ok) {
      const j = await r.json();
      setRows((j.products as Row[]).map((p) => ({
        ...p,
        sale_price_ttc: Number(p.sale_price_ttc),
        purchase_price_ht: p.purchase_price_ht == null ? null : Number(p.purchase_price_ht),
        tax_rate: Number(p.tax_rate),
      })));
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showInactive]);

  function flagSaved(id: string, state: SaveState) {
    setSave((s) => ({ ...s, [id]: state }));
    if (state === 'saved') {
      clearTimeout(savedTimers.current[id]);
      savedTimers.current[id] = setTimeout(() => setSave((s) => ({ ...s, [id]: 'idle' })), 1600);
    }
  }

  /** Applique un changement local + enregistre le champ. Revient en arrière si l'API refuse. */
  async function patch(id: string, patchBody: Record<string, unknown>, apply: (r: Row) => Row) {
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    setRows((rs) => rs.map((r) => (r.id === id ? apply(r) : r)));
    flagSaved(id, 'saving');
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) throw new Error('save');
      flagSaved(id, 'saved');
    } catch {
      setRows((rs) => rs.map((r) => (r.id === id ? before : r))); // revert
      flagSaved(id, 'error');
    }
  }

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = minP ? Number(minP.replace(',', '.')) : null;
    const max = maxP ? Number(maxP.replace(',', '.')) : null;
    let out = rows.filter((r) => {
      if (needle && !(`${r.name} ${r.sku ?? ''} ${r.barcode ?? ''}`.toLowerCase().includes(needle))) return false;
      if (fCat === 'none' ? r.category_id != null : fCat !== 'all' && r.category_id !== fCat) return false;
      if (fTax !== 'all' && r.tax_rate_id !== fTax) return false;
      if (min != null && r.sale_price_ttc < min) return false;
      if (max != null && r.sale_price_ttc > max) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      if (sortKey === 'price') return (a.sale_price_ttc - b.sale_price_ttc) * dir;
      if (sortKey === 'category') return (a.category_name ?? '').localeCompare(b.category_name ?? '', 'fr') * dir;
      if (sortKey === 'margin') return ((marginPct(a) ?? -1) - (marginPct(b) ?? -1)) * dir;
      return a.name.localeCompare(b.name, 'fr') * dir;
    });
    return out;
  }, [rows, q, fCat, fTax, minP, maxP, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }
  const sortArrow = (k: SortKey) => (sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const Dot = ({ id }: { id: string }) => {
    const st = save[id] ?? 'idle';
    if (st === 'saving') return <span className="text-ink-soft text-xs" title="Enregistrement…">…</span>;
    if (st === 'saved') return <span className="text-success text-xs" title="Enregistré">✓</span>;
    if (st === 'error') return <span className="text-danger text-xs" title="Échec de l’enregistrement">!</span>;
    return <span className="text-transparent text-xs">·</span>;
  };

  const cell = 'px-2 py-1.5 border-b border-border align-middle';
  const inp = 'input h-8 w-full text-sm';

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      {/* En-tête */}
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produits — vue liste</h1>
          <p className="text-sm text-ink-soft mt-0.5">Modifiez plusieurs articles à la volée. Chaque changement est enregistré automatiquement.</p>
        </div>
        <Link href="/products" className="btn-soft">← Vue fiches</Link>
      </div>

      {/* Filtres */}
      <div className="px-6 md:px-8 py-3 border-b border-border shrink-0 flex flex-wrap items-center gap-2">
        <input className="input h-9 w-56 max-w-full" placeholder="Rechercher (nom, SKU, code-barres)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input h-9 text-sm" value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="all">Toutes catégories</option>
          <option value="none">Sans catégorie</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input h-9 text-sm" value={fTax} onChange={(e) => setFTax(e.target.value)}>
          <option value="all">Toutes TVA</option>
          {taxRates.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.rate}%)</option>)}
        </select>
        <div className="flex items-center gap-1 text-sm">
          <input className="input h-9 w-20" inputMode="decimal" placeholder="Prix min" value={minP} onChange={(e) => setMinP(e.target.value)} />
          <span className="text-ink-soft">–</span>
          <input className="input h-9 w-20" inputMode="decimal" placeholder="Prix max" value={maxP} onChange={(e) => setMaxP(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-ink-soft cursor-pointer ml-auto">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Afficher les archivés
        </label>
        <span className="text-sm text-ink-soft whitespace-nowrap">{view.length} produit{view.length > 1 ? 's' : ''}</span>
      </div>

      {/* Tableau */}
      <div className="flex-1 min-h-0 overflow-auto">
        {loading && rows.length === 0 ? (
          <div className="p-8 text-ink-soft">Chargement…</div>
        ) : view.length === 0 ? (
          <div className="p-8 text-ink-soft">Aucun produit ne correspond à ces filtres.</div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[1040px]">
            <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_var(--border,#e5e7eb)]">
              <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="px-2 py-2 w-6"></th>
                <th className="px-2 py-2 cursor-pointer select-none" onClick={() => toggleSort('name')}>Nom{sortArrow('name')}</th>
                <th className="px-2 py-2 cursor-pointer select-none" onClick={() => toggleSort('category')}>Catégorie{sortArrow('category')}</th>
                <th className="px-2 py-2">TVA</th>
                <th className="px-2 py-2 text-right">Achat HT</th>
                <th className="px-2 py-2 text-right cursor-pointer select-none" onClick={() => toggleSort('price')}>Vente TTC{sortArrow('price')}</th>
                <th className="px-2 py-2 text-right cursor-pointer select-none" onClick={() => toggleSort('margin')}>Marge{sortArrow('margin')}</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Code-barres</th>
                <th className="px-2 py-2 text-center">Caisse</th>
                <th className="px-2 py-2 text-center">Actif</th>
              </tr>
            </thead>
            <tbody>
              {view.map((r) => {
                const m = marginPct(r);
                return (
                  <tr key={r.id} className={r.is_active ? '' : 'opacity-60'}>
                    <td className={`${cell} text-center`}><Dot id={r.id} /></td>
                    <td className={cell}>
                      <input className={inp} defaultValue={r.name} disabled={!canEdit}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.name) void patch(r.id, { name: v }, (row) => ({ ...row, name: v })); }} />
                    </td>
                    <td className={cell}>
                      <select className={inp} value={r.category_id ?? ''} disabled={!canEdit}
                        onChange={(e) => { const v = e.target.value || null; void patch(r.id, { category_id: v }, (row) => ({ ...row, category_id: v, category_name: categories.find((c) => c.id === v)?.name ?? null })); }}>
                        <option value="">—</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td className={cell}>
                      <select className={inp} value={r.tax_rate_id} disabled={!canEdit}
                        onChange={(e) => { const t = taxRates.find((x) => x.id === e.target.value); if (t) void patch(r.id, { tax_rate_id: t.id }, (row) => ({ ...row, tax_rate_id: t.id, tax_rate: t.rate, tax_rate_code: t.code })); }}>
                        {taxRates.map((t) => <option key={t.id} value={t.id}>{t.rate}%</option>)}
                      </select>
                    </td>
                    <td className={`${cell} text-right`}>
                      <input className={`${inp} text-right`} inputMode="decimal" disabled={!canEdit}
                        defaultValue={r.purchase_price_ht == null ? '' : String(r.purchase_price_ht)}
                        onBlur={(e) => {
                          const raw = e.target.value.trim().replace(',', '.');
                          const v = raw === '' ? null : Number(raw);
                          if (v != null && !Number.isFinite(v)) return;
                          if (v !== r.purchase_price_ht) void patch(r.id, { purchase_price_ht: v }, (row) => ({ ...row, purchase_price_ht: v }));
                        }} />
                    </td>
                    <td className={`${cell} text-right`}>
                      <input className={`${inp} text-right`} inputMode="decimal" disabled={!canEdit || r.price_is_free}
                        defaultValue={r.price_is_free ? '' : String(r.sale_price_ttc)}
                        placeholder={r.price_is_free ? 'libre' : ''}
                        onBlur={(e) => {
                          const raw = e.target.value.trim().replace(',', '.');
                          if (raw === '') return;
                          const v = Number(raw);
                          if (!Number.isFinite(v) || v < 0 || v === r.sale_price_ttc) return;
                          void patch(r.id, { sale_price_ttc: v }, (row) => ({ ...row, sale_price_ttc: v }));
                        }} />
                    </td>
                    <td className={`${cell} text-right tabular-nums whitespace-nowrap ${m != null && m < 0 ? 'text-danger' : 'text-ink-soft'}`}>
                      {m == null ? '—' : `${m.toFixed(1).replace('.', ',')} %`}
                    </td>
                    <td className={cell}>
                      <input className={inp} defaultValue={r.sku ?? ''} disabled={!canEdit}
                        onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (r.sku ?? null)) void patch(r.id, { sku: v }, (row) => ({ ...row, sku: v })); }} />
                    </td>
                    <td className={cell}>
                      <input className={inp} defaultValue={r.barcode ?? ''} disabled={!canEdit}
                        onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (r.barcode ?? null)) void patch(r.id, { barcode: v }, (row) => ({ ...row, barcode: v })); }} />
                    </td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={r.visible_in_pos} disabled={!canEdit}
                        onChange={(e) => { const v = e.target.checked; void patch(r.id, { visible_in_pos: v }, (row) => ({ ...row, visible_in_pos: v })); }} />
                    </td>
                    <td className={`${cell} text-center`}>
                      <input type="checkbox" checked={r.is_active} disabled={!canEdit}
                        onChange={(e) => { const v = e.target.checked; void patch(r.id, { is_active: v }, (row) => ({ ...row, is_active: v })); }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
