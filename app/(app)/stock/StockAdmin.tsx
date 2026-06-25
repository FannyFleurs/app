'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
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

export default function StockAdmin({ canAdjust, stores }: { canAdjust: boolean; stores: Store[] }) {
  const [tab, setTab] = useState<'levels' | 'movements'>('levels');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  async function reload() {
    setLoading(true);
    if (tab === 'levels') {
      const r = await fetch('/api/stock/levels');
      if (r.ok) setLevels((await r.json()).levels);
    } else {
      const r = await fetch('/api/stock/movement');
      if (r.ok) setMovements((await r.json()).movements);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [tab]);

  const filteredLevels = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return levels;
    return levels.filter((l) =>
      l.product_name.toLowerCase().includes(needle) ||
      l.product_sku?.toLowerCase().includes(needle),
    );
  }, [levels, q]);

  const lowStock = levels.filter((l) =>
    l.min_stock != null && Number(l.quantity) <= Number(l.min_stock),
  );
  const totalRefs = new Set(levels.map((l) => l.product_id)).size;
  const totalUnits = levels.reduce((s, l) => s + Number(l.quantity), 0);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Stock"
        subtitle="Niveaux par boutique, journal des mouvements append-only et ajustements."
        actions={canAdjust ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Mouvement stock
          </button>
        ) : null}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Références suivies" value={totalRefs.toString()} />
        <Kpi label="Unités totales" value={totalUnits.toFixed(0)} />
        <Kpi label="Alertes stock bas" value={lowStock.length.toString()} tone={lowStock.length > 0 ? 'warning' : undefined} />
        <Kpi label="Boutiques" value={stores.length.toString()} />
      </section>

      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setTab('levels')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === 'levels' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft'
                }`}>
          Niveaux actuels
        </button>
        <button onClick={() => setTab('movements')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  tab === 'movements' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft'
                }`}>
          Journal des mouvements
        </button>
      </div>

      {tab === 'levels' ? (
        <>
          <input
            className="input max-w-md"
            placeholder="Rechercher par nom ou SKU…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
                <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Produit</th>
                    <th className="text-left px-4 py-3">SKU</th>
                    <th className="text-left px-4 py-3">Boutique</th>
                    <th className="text-right px-4 py-3">Quantité</th>
                    <th className="text-right px-4 py-3">Seuil min</th>
                    <th className="text-center px-4 py-3">État</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLevels.map((l) => {
                    const q = Number(l.quantity);
                    const min = l.min_stock != null ? Number(l.min_stock) : null;
                    const low = min != null && q <= min;
                    return (
                      <tr key={`${l.product_id}-${l.store_id}`} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{l.product_name}</td>
                        <td className="px-4 py-3 text-ink-soft text-xs font-mono">{l.product_sku ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-soft">{l.store_name}</td>
                        <td className="px-4 py-3 text-right">{q} {l.unit}</td>
                        <td className="px-4 py-3 text-right text-ink-soft">{l.min_stock ?? '—'}</td>
                        <td className="px-4 py-3 text-center">
                          {low ? <Badge tone="warning">Stock bas</Badge> : <Badge tone="success">OK</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {loading ? (
            <div className="text-sm text-ink-soft">Chargement…</div>
          ) : movements.length === 0 ? (
            <EmptyState icon="∅" title="Aucun mouvement" />
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Produit</th>
                    <th className="text-left px-4 py-3">Boutique</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-right px-4 py-3">Δ</th>
                    <th className="text-right px-4 py-3">Avant → Après</th>
                    <th className="text-left px-4 py-3">Motif</th>
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
        </>
      )}

      {showCreate && (
        <CreateMovementModal
          stores={stores}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); void reload(); }}
        />
      )}
    </div>
  );
}

function CreateMovementModal({ stores, onClose, onSaved }: {
  stores: Store[]; onClose: () => void; onSaved: () => void;
}) {
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string | null }>>([]);
  const [productId, setProductId] = useState('');
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [type, setType] = useState<'purchase' | 'adjustment' | 'loss' | 'inventory'>('purchase');
  const [delta, setDelta] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/products');
      if (r.ok) {
        const j = await r.json();
        setProducts(j.products);
      }
    })();
  }, []);

  async function submit() {
    if (!productId || !storeId || delta === 0 || !reason.trim()) {
      setError('Tous les champs sont requis (et delta ≠ 0).');
      return;
    }
    setSaving(true); setError(null);
    const r = await fetch('/api/stock/movement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: productId,
        movement_type: type,
        quantity_delta: delta,
        reason: reason.trim(),
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Nouveau mouvement</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Produit</label>
            <select className="input mt-1" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium text-ink-soft">Boutique</label>
              <select className="input mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-ink-soft">Type</label>
              <select className="input mt-1" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="purchase">Entrée fournisseur</option>
                <option value="adjustment">Ajustement</option>
                <option value="loss">Perte / casse</option>
                <option value="inventory">Inventaire</option>
              </select>
            </div>
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
            <label className="text-sm font-medium text-ink-soft">Motif</label>
            <input className="input mt-1" value={reason} onChange={(e) => setReason(e.target.value)}
                   placeholder="ex : Livraison Aoki Fleurs, perte fleurs fanées" />
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${tone === 'warning' ? 'text-warning' : ''}`}>{value}</div>
    </div>
  );
}
