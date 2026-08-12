'use client';

import { useEffect, useMemo, useState } from 'react';
import { confirmThemed } from '@/lib/ui/dialog';
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
  category_id?: string | null;
  category_name?: string | null;
}

/** Article archivé : sorti de la caisse, conservé pour l'historique. */
interface ArchivedProduct {
  id: string;
  name: string;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
}

/**
 * Lignes à zéro pour la boutique affichée, éventuellement restreintes à une
 * catégorie.
 *
 * Le zéro se lit sur la quantité, pas sur l'absence de ligne : un article
 * jamais entré en stock n'a pas de ligne du tout et n'a rien à faire ici — on
 * ne propose d'archiver que ce qui a réellement été écoulé.
 */
export function zeroStockRows(levels: StockLevel[], categoryId: string): StockLevel[] {
  return levels.filter((l) => {
    if (Number(l.quantity) !== 0) return false;
    if (categoryId === 'all') return true;
    if (categoryId === 'none') return !l.category_id;
    return l.category_id === categoryId;
  });
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

type Section = 'levels' | 'zero' | 'archived' | 'create' | 'movements' | 'inventory';

const NAV: Array<{ key: Section; group: 'Gestion' | 'Catalogue' | 'Inventaire'; label: string; icon: IconName }> = [
  { key: 'levels',     group: 'Gestion',    label: 'Visualiser stock',       icon: 'stock' },
  { key: 'create',     group: 'Gestion',    label: 'Faire un mouvement',     icon: 'exports' },
  { key: 'movements',  group: 'Gestion',    label: 'Visualiser mouvements',  icon: 'orders' },
  { key: 'zero',       group: 'Catalogue',  label: 'Stock à 0',              icon: 'warning' },
  { key: 'archived',   group: 'Catalogue',  label: 'Produits archivés',      icon: 'package' },
  { key: 'inventory',  group: 'Inventaire', label: 'Inventaire',             icon: 'invoices' },
];

export default function StockAdmin({ canAdjust, stores, lockedStoreId }: { canAdjust: boolean; stores: Store[]; lockedStoreId?: string | null }) {
  const [section, setSection] = useState<Section>('levels');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [archived, setArchived] = useState<ArchivedProduct[]>([]);
  // Sélection de l'écran « Stock à 0 » : les identifiants d'articles cochés.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [zeroCat, setZeroCat] = useState<string>('all');
  const [busyArchive, setBusyArchive] = useState(false);
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
    } else if (section === 'archived') {
      // `active=false` lève le filtre côté serveur : la réponse contient tout
      // le catalogue, on ne garde ici que ce qui est archivé.
      const r = await fetch('/api/products?active=false');
      if (r.ok) {
        const j = await r.json();
        setArchived((j.products as Array<Record<string, unknown>>)
          .filter((p) => p.is_active === false)
          .map((p) => ({
            id: String(p.id), name: String(p.name),
            sku: (p.sku as string) ?? null,
            category_id: (p.category_id as string) ?? null,
            category_name: (p.category_name as string) ?? null,
          })));
      }
    } else {
      const r = await fetch(`/api/stock/levels${qs}`);
      if (r.ok) setLevels((await r.json()).levels);
      setSelection(new Set());
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [section, storeId]);

  /** Sort de la caisse (ou y remet) les articles désignés, puis recharge. */
  async function applyArchive(ids: string[], archiver: boolean) {
    if (ids.length === 0) return;
    if (archiver && !(await confirmThemed({
      title: ids.length === 1 ? 'Archiver cet article' : `Archiver ${ids.length} articles`,
      confirmLabel: 'Archiver',
      message: 'Ils disparaîtront de la caisse (tuiles, recherche, scan) dans TOUTES les boutiques. '
        + 'Leur historique de ventes est conservé, et « Produits archivés » permet de les remettre en rayon.',
    }))) return;
    setBusyArchive(true);
    const r = await fetch('/api/products/bulk-archive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, archived: archiver }),
    });
    setBusyArchive(false);
    if (r.ok) { setSelection(new Set()); void reload(); }
  }

  const zeroRows = useMemo(() => zeroStockRows(levels, zeroCat), [levels, zeroCat]);
  const filteredArchived = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return archived;
    return archived.filter((p) =>
      p.name.toLowerCase().includes(needle) || p.sku?.toLowerCase().includes(needle),
    );
  }, [archived, q]);
  // Catégories réellement présentes dans le stock affiché : un menu qui ne
  // propose que des filtres donnant un résultat.
  const zeroCats = useMemo(() => {
    const m = new Map<string, string>();
    let sansCat = false;
    for (const l of levels.filter((x) => Number(x.quantity) === 0)) {
      if (l.category_id) m.set(l.category_id, l.category_name ?? '—');
      else sansCat = true;
    }
    return { list: [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')), sansCat };
  }, [levels]);

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
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
        <PageHeader
          title="Stock"
          subtitle="Valeur du stock, mouvements et inventaires, par boutique."
          actions={!lockedStoreId && stores.length > 1 ? (
            <select className="input h-10 min-w-[180px] text-sm" value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
        />
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

        {section === 'zero' && (
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Stock à 0</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Articles épuisés dans <span className="font-medium text-ink">{stores.find((s) => s.id === storeId)?.name ?? '—'}</span>.
                Archiver retire l&apos;article de la caisse de <strong>toutes</strong> les boutiques ;
                l&apos;historique est conservé et le retour se fait depuis « Produits archivés ».
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select className="input h-10 w-full sm:w-64 text-sm" value={zeroCat}
                      onChange={(e) => { setZeroCat(e.target.value); setSelection(new Set()); }}>
                <option value="all">Toutes les catégories</option>
                {zeroCats.list.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                {zeroCats.sansCat && <option value="none">Sans catégorie</option>}
              </select>
              <button
                className="btn-primary h-10 px-4 text-sm disabled:opacity-40"
                disabled={selection.size === 0 || busyArchive}
                onClick={() => void applyArchive([...selection], true)}
              >
                {busyArchive ? '…' : `Archiver la sélection (${selection.size})`}
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-ink-soft">Chargement…</div>
            ) : zeroRows.length === 0 ? (
              <EmptyState icon="✓" title="Aucun article à 0"
                          description="Tous les articles suivis ont du stock dans cette boutique." />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          aria-label="Tout sélectionner"
                          checked={selection.size === zeroRows.length && zeroRows.length > 0}
                          onChange={(e) => setSelection(
                            e.target.checked ? new Set(zeroRows.map((l) => l.product_id)) : new Set(),
                          )}
                        />
                      </th>
                      <th className="text-left px-4 py-3 font-semibold">Produit</th>
                      <th className="text-left px-4 py-3 font-semibold">Catégorie</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroRows.map((l) => {
                      const coche = selection.has(l.product_id);
                      return (
                        <tr key={l.product_id} className="border-t border-border hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Sélectionner ${l.product_name}`}
                              checked={coche}
                              onChange={(e) => setSelection((cur) => {
                                const n = new Set(cur);
                                if (e.target.checked) n.add(l.product_id); else n.delete(l.product_id);
                                return n;
                              })}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium">
                            <div>{l.product_name}</div>
                            {l.product_sku && (
                              <div className="text-[11px] text-ink-soft font-mono">{l.product_sku}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-soft">{l.category_name ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <button className="btn-soft text-xs h-8 px-3" disabled={busyArchive}
                                    onClick={() => void applyArchive([l.product_id], true)}>
                              Archiver
                            </button>
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

        {section === 'archived' && (
          <div className="p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Produits archivés</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Articles retirés de la caisse. Les désarchiver les replace immédiatement
                sur les tuiles et dans la recherche.
              </p>
            </div>

            <div className="relative max-w-xl">
              <input className="input pr-9" placeholder="Rechercher…" value={q}
                     onChange={(e) => setQ(e.target.value)} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
            </div>

            {loading ? (
              <div className="text-sm text-ink-soft">Chargement…</div>
            ) : filteredArchived.length === 0 ? (
              <EmptyState icon="∅" title="Aucun produit archivé"
                          description="Les articles archivés depuis la fiche produit ou l'écran « Stock à 0 » apparaissent ici." />
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Produit</th>
                      <th className="text-left px-4 py-3 font-semibold">Catégorie</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArchived.map((p) => (
                      <tr key={p.id} className="border-t border-border hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          <div>{p.name}</div>
                          {p.sku && <div className="text-[11px] text-ink-soft font-mono">{p.sku}</div>}
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{p.category_name ?? '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button className="btn-primary text-xs h-8 px-3" disabled={busyArchive}
                                  onClick={() => void applyArchive([p.id], false)}>
                            Désarchiver
                          </button>
                        </td>
                      </tr>
                    ))}
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
