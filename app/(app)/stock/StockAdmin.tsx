'use client';

import { useEffect, useMemo, useState } from 'react';
import { QuantityKeypadModal, TypeAndReasonModal, type ProductRow } from './MovementModals';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import Icon, { type IconName } from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';

/** Quantité de stock : entier si rond, sinon jusqu'à 3 décimales sans zéros
 *  inutiles (11.000 → « 11 », 1.500 → « 1,5 »). */
function fmtQty(v: string | number): string {
  return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

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

export default function StockAdmin({ canAdjust, stores, lockedStoreId }: { canAdjust: boolean; stores: Store[]; lockedStoreId?: string | null }) {
  const [section, setSection] = useState<Section>('levels');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // Boutique visualisée : le stock et les mouvements sont TOUJOURS filtrés sur
  // UNE boutique (celle du poste par défaut) — on ne mélange jamais les stocks
  // de plusieurs boutiques. Sélecteur pour basculer.
  const [storeId, setStoreId] = useState<string>('');
  useEffect(() => {
    // Poste de caisse appairé : verrouillé sur sa boutique (pas de sélecteur).
    if (lockedStoreId) { setStoreId(lockedStoreId); return; }
    let sid = '';
    try { sid = localStorage.getItem('webpos_current_store_id') || ''; } catch { /* ignore */ }
    if (!sid || !stores.some((s) => s.id === sid)) sid = stores[0]?.id ?? '';
    setStoreId(sid);
  }, [stores, lockedStoreId]);

  async function reload() {
    if (!storeId) return;
    setLoading(true);
    const qs = `?store_id=${encodeURIComponent(storeId)}`;
    if (section === 'movements') {
      const r = await fetch(`/api/stock/movement${qs}`);
      if (r.ok) setMovements((await r.json()).movements);
    } else {
      const r = await fetch(`/api/stock/levels${qs}`);
      if (r.ok) setLevels((await r.json()).levels);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [section, storeId]);

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
    <div className="flex flex-col md:h-[calc(100%-1.5rem)] md:m-3 md:overflow-hidden md:rounded-2xl md:border md:border-border bg-surface">
      <div className="px-4 md:px-6 pt-3 md:pt-4 pb-3 shrink-0 flex items-start justify-between gap-3 flex-wrap">
        <PageHeader title="Stock" subtitle="Valeur du stock, mouvements et inventaires, par boutique." />
        {!lockedStoreId && stores.length > 1 && (
          <label className="text-sm">
            <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
            <select className="input h-10 min-w-[180px]" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_3fr] md:overflow-hidden">
      {/* SIDEBAR */}
      <aside className="border-r border-border bg-white overflow-y-auto">
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
          <div className="p-6">
            {canAdjust ? (
              <MovementPicker
                storeId={storeId || (stores[0]?.id ?? '')}
                storeName={stores.find((s) => s.id === storeId)?.name ?? stores[0]?.name ?? ''}
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
                          <td className={`px-4 py-3 text-right tabular-nums ${Number(m.quantity_delta) >= 0 ? 'text-success' : 'text-danger'}`}>
                            {Number(m.quantity_delta) > 0 ? '+' : ''}{fmtQty(m.quantity_delta)}
                          </td>
                          <td className="px-4 py-3 text-right text-ink-soft text-xs tabular-nums">
                            {fmtQty(m.previous_quantity)} → {fmtQty(m.new_quantity)}
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


/**
 * Sélecteur produit pleine page → modale clavier ± → modale type/motif.
 * Étape 1 : recherche + liste cliquable.
 * Étape 2 : clavier pour saisir la quantité (signée).
 * Étape 3 : type de mouvement + motif (obligatoire si delta < 0 ou perte).
 */
function MovementPicker({ storeId, storeName, onSaved }: {
  storeId: string; storeName: string; onSaved: () => void;
}) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<
    | { kind: 'pick' }
    | { kind: 'qty'; product: ProductRow }
    | { kind: 'type'; product: ProductRow; delta: number }
  >({ kind: 'pick' });

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/products?active=false');
      if (r.ok) setProducts((await r.json()).products);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(needle) ||
      p.sku?.toLowerCase().includes(needle),
    );
  }, [products, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Faire un mouvement</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Boutique : <span className="font-medium text-ink">{storeName || '—'}</span> ·
            Sélectionnez un produit dans la liste.
          </p>
        </div>
        <div className="relative w-full max-w-md">
          <input
            className="input pr-9"
            placeholder="Rechercher (nom ou SKU)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Aucun produit"
          description="Créez d'abord des produits ou ajustez votre recherche."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Produit</th>
                <th className="text-left px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-gray-50 cursor-pointer"
                    onClick={() => setStep({ kind: 'qty', product: p })}>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-ink-soft text-xs font-mono">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="btn-soft text-xs h-8 px-3">+ / −</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step.kind === 'qty' && (
        <QuantityKeypadModal
          product={step.product}
          onClose={() => setStep({ kind: 'pick' })}
          onConfirm={(delta) => setStep({ kind: 'type', product: step.product, delta })}
        />
      )}

      {step.kind === 'type' && (
        <TypeAndReasonModal
          product={step.product}
          delta={step.delta}
          storeId={storeId}
          onClose={() => setStep({ kind: 'qty', product: step.product })}
          onSaved={() => { setStep({ kind: 'pick' }); onSaved(); }}
        />
      )}
    </div>
  );
}
