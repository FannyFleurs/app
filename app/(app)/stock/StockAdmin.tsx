'use client';

import { useEffect, useMemo, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import Icon, { type IconName } from '@/components/Icon';
import { formatEUR } from '@/lib/services/money';

interface Store { id: string; name: string }

interface StockLevel {
  product_id: string;
  product_name: string;
  product_sku: string | null;
  store_id: string;
  store_name: string;
  quantity: string;
  min_stock: string | null;
  max_stock: string | null;
  unit: string;
  purchase_price_ht?: string | null;
  sale_price_ttc?: string | null;
}

interface Movement {
  id: string;
  movement_type: string;
  quantity_delta: string;
  previous_quantity: string;
  new_quantity: string;
  reason: string;
  created_at: string;
  product_name: string;
  store_name: string;
  user_name: string | null;
}

const TYPE_LABELS: Record<string, { label: string; tone: 'success'|'soft'|'warning'|'danger'|'neutral' }> = {
  purchase:     { label: 'Entrée',       tone: 'success' },
  sale:         { label: 'Vente',        tone: 'neutral' },
  return:       { label: 'Retour',       tone: 'soft' },
  adjustment:   { label: 'Ajustement',   tone: 'warning' },
  loss:         { label: 'Perte',        tone: 'danger' },
  transfer_in:  { label: 'Transfert ↗', tone: 'soft' },
  transfer_out: { label: 'Transfert ↙', tone: 'soft' },
  inventory:    { label: 'Inventaire',   tone: 'neutral' },
};

type Section = 'levels' | 'create' | 'movements' | 'inventory';

const NAV: Array<{ key: Section; group: 'Gestion' | 'Inventaire'; label: string; icon: IconName }> = [
  { key: 'levels',     group: 'Gestion',    label: 'Visualiser stock',       icon: 'stock' },
  { key: 'create',     group: 'Gestion',    label: 'Faire un mouvement',     icon: 'exports' },
  { key: 'movements',  group: 'Gestion',    label: 'Visualiser mouvements',  icon: 'orders' },
  { key: 'inventory',  group: 'Inventaire', label: 'Inventaire',             icon: 'invoices' },
];

export default function StockAdmin({ canAdjust, stores }: { canAdjust: boolean; stores: Store[] }) {
  const [section, setSection] = useState<Section>('levels');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  async function reload() {
    setLoading(true);
    if (section === 'movements') {
      const r = await fetch('/api/stock/movement');
      if (r.ok) setMovements((await r.json()).movements);
    } else {
      const r = await fetch('/api/stock/levels');
      if (r.ok) setLevels((await r.json()).levels);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [section]);

  const filteredLevels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return levels;
    return levels.filter((l) =>
      l.product_name.toLowerCase().includes(needle) ||
      l.product_sku?.toLowerCase().includes(needle),
    );
  }, [levels, q]);

  const totalPurchaseValue = useMemo(
    () => levels.reduce((s, l) => s + Number(l.purchase_price_ht ?? 0) * Number(l.quantity), 0),
    [levels],
  );
  const totalSaleValue = useMemo(
    () => levels.reduce((s, l) => s + Number(l.sale_price_ttc ?? 0) * Number(l.quantity), 0),
    [levels],
  );

  const groups: Record<string, typeof NAV> = NAV.reduce((acc, item) => {
    (acc[item.group] = acc[item.group] || []).push(item);
    return acc;
  }, {} as Record<string, typeof NAV>);

  return (
    <div className="grid grid-cols-[260px_1fr] h-[calc(100vh-56px)] overflow-hidden">
      {/* SIDEBAR */}
      <aside className="border-r border-border bg-white overflow-y-auto">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">Section</div>
          <div className="text-lg font-semibold tracking-tight">Stock</div>
        </div>
        <div className="p-3 space-y-4">
          {Object.entries(groups).map(([g, items]) => (
            <div key={g}>
              <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-ink-soft font-semibold">
                {g}
              </div>
              <div className="space-y-0.5">
                {items.map((it) => {
                  const active = section === it.key;
                  return (
                    <button
                      key={it.key}
                      onClick={() => setSection(it.key)}
                      className={`nav-link w-full ${active ? 'nav-link-active' : ''}`}
                    >
                      <span className={active ? 'text-accent-deep' : 'text-ink-soft'}>
                        <Icon name={it.icon} size={20} />
                      </span>
                      <span className="truncate">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* CONTENU */}
      <main className="overflow-y-auto bg-white">
        {section === 'levels' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
              <ValueCard
                value={totalPurchaseValue}
                label="Valeur à l'achat"
                tone="accent"
              />
              <ValueCard
                value={totalSaleValue}
                label="Valeur à la vente (TTC)"
                tone="success"
              />
              <button
                className="btn-primary md:self-stretch md:px-6"
                onClick={() => exportCsv(filteredLevels)}
              >
                Exporter le rapport complet
              </button>
            </div>

            <div className="relative max-w-2xl">
              <input
                className="input pr-9"
                placeholder="Rechercher…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
            </div>

            {loading ? (
              <div className="text-sm text-ink-soft">Chargement…</div>
            ) : filteredLevels.length === 0 ? (
              <EmptyState
                icon="▣"
                title="Aucun produit avec suivi de stock"
                description="Activez « Suivi du stock » sur la fiche produit, ou ajoutez un mouvement d'entrée."
              />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Produit</th>
                      <th className="text-right px-4 py-3 font-semibold">Stock</th>
                      <th className="text-right px-4 py-3 font-semibold">Valeur achat</th>
                      <th className="text-right px-4 py-3 font-semibold">Valeur vente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLevels.map((l) => {
                      const qty = Number(l.quantity);
                      const min = l.min_stock != null ? Number(l.min_stock) : null;
                      const negative = qty < 0;
                      const low = !negative && min != null && qty <= min;
                      const purchase = Number(l.purchase_price_ht ?? 0) * qty;
                      const sale = Number(l.sale_price_ttc ?? 0) * qty;
                      return (
                        <tr key={`${l.product_id}-${l.store_id}`} className="border-t border-border hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">
                            <div>{l.product_name}</div>
                            {l.product_sku && (
                              <div className="text-[11px] text-ink-soft font-mono">{l.product_sku}</div>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${
                            negative ? 'text-danger' : low ? 'text-warning' : 'text-success'
                          }`}>
                            {qty}
                          </td>
                          <td className={`px-4 py-3 text-right ${negative ? 'text-danger' : 'text-ink'}`}>
                            {formatEUR(purchase)}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${negative ? 'text-danger' : 'text-ink'}`}>
                            {formatEUR(sale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {section === 'create' && (
          <div className="p-6 max-w-xl">
            {canAdjust ? (
              <InlineMovementForm
                storeId={stores[0]?.id ?? ''}
                storeName={stores[0]?.name ?? ''}
                onSaved={() => { setSection('movements'); }}
              />
            ) : (
              <EmptyState
                icon="🔒"
                title="Action restreinte"
                description="Vous n'avez pas la permission de créer un mouvement de stock."
              />
            )}
          </div>
        )}

        {section === 'movements' && (
          <div className="p-6 space-y-4">
            {loading ? (
              <div className="text-sm text-ink-soft">Chargement…</div>
            ) : movements.length === 0 ? (
              <EmptyState icon="∅" title="Aucun mouvement" />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Date</th>
                      <th className="text-left px-4 py-3 font-semibold">Produit</th>
                      <th className="text-left px-4 py-3 font-semibold">Boutique</th>
                      <th className="text-left px-4 py-3 font-semibold">Type</th>
                      <th className="text-right px-4 py-3 font-semibold">Δ</th>
                      <th className="text-right px-4 py-3 font-semibold">Avant → Après</th>
                      <th className="text-left px-4 py-3 font-semibold">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => {
                      const t = TYPE_LABELS[m.movement_type] ?? { label: m.movement_type, tone: 'neutral' as const };
                      return (
                        <tr key={m.id} className="border-t border-border">
                          <td className="px-4 py-3 text-ink-soft text-xs">{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 font-medium">{m.product_name}</td>
                          <td className="px-4 py-3 text-ink-soft">{m.store_name}</td>
                          <td className="px-4 py-3"><Badge tone={t.tone}>{t.label}</Badge></td>
                          <td className={`px-4 py-3 text-right ${Number(m.quantity_delta) >= 0 ? 'text-success' : 'text-danger'}`}>
                            {Number(m.quantity_delta) > 0 ? '+' : ''}{m.quantity_delta}
                          </td>
                          <td className="px-4 py-3 text-right text-ink-soft text-xs">
                            {m.previous_quantity} → {m.new_quantity}
                          </td>
                          <td className="px-4 py-3 text-xs">{m.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {section === 'inventory' && (
          <div className="p-6 max-w-2xl">
            <h2 className="text-xl font-semibold tracking-tight">Inventaire</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Lance un inventaire complet en générant un mouvement de type <strong>inventaire</strong> par produit.
            </p>
            <div className="mt-4 card p-5">
              <p className="text-sm text-ink-soft">
                Pour ajuster un stock après comptage, créez un mouvement de type
                <em> Inventaire </em> (delta = quantité physique − quantité système).
              </p>
              <button
                className="btn-primary mt-3 text-sm"
                onClick={() => setSection('create')}
              >
                + Saisir un ajustement d&apos;inventaire
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ValueCard({ value, label, tone }: { value: number; label: string; tone: 'accent' | 'success' }) {
  return (
    <div className="card p-5">
      <div className={`text-2xl font-semibold tracking-tight ${tone === 'accent' ? 'text-accent-deep' : 'text-success'}`}>
        {formatEUR(value)}
      </div>
      <div className="text-xs text-ink-soft mt-1">{label}</div>
    </div>
  );
}

function exportCsv(rows: StockLevel[]) {
  const head = ['Produit', 'SKU', 'Boutique', 'Quantité', 'PA HT', 'PV TTC', 'Valeur achat', 'Valeur vente'];
  const lines = [head.join(';')].concat(
    rows.map((l) => [
      JSON.stringify(l.product_name),
      l.product_sku ?? '',
      JSON.stringify(l.store_name),
      l.quantity,
      l.purchase_price_ht ?? '',
      l.sale_price_ttc ?? '',
      (Number(l.purchase_price_ht ?? 0) * Number(l.quantity)).toFixed(2),
      (Number(l.sale_price_ttc ?? 0) * Number(l.quantity)).toFixed(2),
    ].join(';')),
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function InlineMovementForm({ storeId, storeName, onSaved }: {
  storeId: string; storeName: string; onSaved: () => void;
}) {
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string | null }>>([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [type, setType] = useState<'purchase' | 'adjustment' | 'loss' | 'inventory'>('purchase');
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/products?active=false');
      if (r.ok) setProducts((await r.json()).products);
    })();
  }, []);

  const filteredProducts = useMemo(() => {
    const needle = productSearch.trim().toLowerCase();
    if (!needle) return products.slice(0, 20);
    return products
      .filter((p) =>
        p.name.toLowerCase().includes(needle) ||
        p.sku?.toLowerCase().includes(needle),
      )
      .slice(0, 20);
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  // Motif obligatoire uniquement pour sortie (delta < 0) ou perte
  const reasonRequired = delta < 0 || type === 'loss' || type === 'adjustment';

  async function submit() {
    if (!productId) { setError('Sélectionnez un produit.'); return; }
    if (!storeId) { setError('Aucune boutique configurée.'); return; }
    if (delta === 0) { setError('La quantité ne peut pas être nulle.'); return; }
    if (reasonRequired && !reason.trim()) {
      setError('Un motif est requis pour une sortie ou une perte.'); return;
    }
    setSaving(true); setError(null);
    const r = await fetch('/api/stock/movement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: productId,
        movement_type: type,
        quantity_delta: delta,
        reason: reason.trim() || (delta > 0 ? 'Entrée stock' : 'Mouvement stock'),
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">Faire un mouvement</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Enregistre une entrée, sortie, perte ou ajustement sur la boutique connectée :
        <span className="ml-1 font-medium text-ink">{storeName || '—'}</span>.
      </p>
      <div className="card p-5 mt-4 space-y-3">
        <div>
          <label className="text-sm font-medium text-ink-soft">Produit</label>
          {selectedProduct ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-border bg-accent-soft px-3 py-2.5">
              <div className="min-w-0">
                <div className="font-medium truncate">{selectedProduct.name}</div>
                {selectedProduct.sku && (
                  <div className="text-[11px] text-ink-soft font-mono">{selectedProduct.sku}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setProductId(''); setProductSearch(''); }}
                className="text-ink-soft hover:text-danger text-sm"
              >
                ✕
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1">
                <input
                  className="input pr-9"
                  placeholder="Rechercher produit (nom ou SKU)…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
              </div>
              {filteredProducts.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProductId(p.id); setProductSearch(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      <div className="font-medium text-sm">{p.name}</div>
                      {p.sku && <div className="text-[11px] text-ink-soft font-mono">{p.sku}</div>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Type</label>
          <select className="input mt-1 h-11" value={type}
                  onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="purchase">Entrée fournisseur</option>
            <option value="adjustment">Ajustement</option>
            <option value="loss">Perte / casse</option>
            <option value="inventory">Inventaire</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Quantité (+/−)</label>
          <input
            type="number" step="0.001"
            className="input mt-1 text-xl font-semibold"
            value={delta || ''}
            onChange={(e) => setDelta(Number(e.target.value) || 0)}
            placeholder="ex : 10 ou -2"
          />
          <p className="mt-1 text-xs text-ink-soft">Positif pour entrée, négatif pour sortie.</p>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">
            Motif {reasonRequired ? '' : <span className="text-ink-soft/60">(optionnel)</span>}
          </label>
          <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder={reasonRequired
                   ? 'ex : perte fleurs fanées, ajustement après inventaire'
                   : 'ex : Livraison Aoki Fleurs'} />
        </div>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <button onClick={() => void submit()} disabled={saving} className="btn-primary w-full h-11">
          {saving ? 'Enregistrement…' : 'Enregistrer le mouvement'}
        </button>
      </div>
    </div>
  );
}
