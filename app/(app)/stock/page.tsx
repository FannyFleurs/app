import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'soft' | 'neutral' }> = {
  purchase:     { label: 'Entrée',       tone: 'success' },
  sale:         { label: 'Vente',        tone: 'neutral' },
  return:       { label: 'Retour',       tone: 'soft' },
  adjustment:   { label: 'Ajustement',   tone: 'warning' },
  loss:         { label: 'Perte',        tone: 'danger' },
  transfer_in:  { label: 'Transfert ↗', tone: 'soft' },
  transfer_out: { label: 'Transfert ↙', tone: 'soft' },
  inventory:    { label: 'Inventaire',   tone: 'neutral' },
};

export default async function StockPage() {
  const user = (await readSessionFromCookie())!;

  const levels = await query<{
    name: string; store_name: string; quantity: string;
    min_stock: string | null; max_stock: string | null;
    unit: string;
  }>(
    `SELECT p.name, st.name AS store_name, sl.quantity::text, p.min_stock::text, p.max_stock::text, p.unit
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       JOIN stores st ON st.id = sl.store_id
      WHERE p.organization_id = $1 AND p.track_stock = TRUE
      ORDER BY p.name, st.name`,
    [user.organizationId],
  );

  const movements = await query<{
    id: string; movement_type: string; quantity_delta: string;
    previous_quantity: string; new_quantity: string;
    reason: string | null; product_name: string;
    store_name: string; user_name: string | null; created_at: string;
  }>(
    `SELECT m.id, m.movement_type, m.quantity_delta::text,
            m.previous_quantity::text, m.new_quantity::text,
            m.reason, p.name AS product_name,
            st.name AS store_name, u.full_name AS user_name, m.created_at
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       JOIN stores st ON st.id = m.store_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1
      ORDER BY m.created_at DESC LIMIT 100`,
    [user.organizationId],
  );

  const trackedCount = levels.rowCount;
  const lowCount = levels.rows.filter((l) =>
    l.min_stock != null && Number(l.quantity) <= Number(l.min_stock),
  ).length;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Stock"
        subtitle="Niveaux par boutique et journal des mouvements (append-only)."
        badge={{ label: 'Module Phase 2 — schéma actif', tone: 'soft' }}
        actions={(
          <>
            <button className="btn-soft" disabled title="Phase 2">Inventaire</button>
            <button className="btn-primary" disabled title="Phase 2">+ Mouvement</button>
          </>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Références suivies" value={trackedCount.toString()} />
        <Kpi label="Alertes stock bas" value={lowCount.toString()} tone={lowCount > 0 ? 'warning' : undefined} />
        <Kpi label="Mouvements (100)" value={movements.rowCount.toString()} />
        <Kpi label="Boutiques actives" value={new Set(levels.rows.map((l) => l.store_name)).size.toString()} />
      </section>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Niveaux actuels</h2>
        {levels.rowCount === 0 ? (
          <EmptyState
            icon="▣"
            title="Aucun produit avec suivi de stock"
            description="Activez « Suivi du stock » sur la fiche produit pour commencer à tracker les quantités."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-soft text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Produit</th>
                  <th className="text-left px-4 py-3">Boutique</th>
                  <th className="text-right px-4 py-3">Quantité</th>
                  <th className="text-right px-4 py-3">Seuil min</th>
                  <th className="text-right px-4 py-3">Seuil max</th>
                  <th className="text-center px-4 py-3">État</th>
                </tr>
              </thead>
              <tbody>
                {levels.rows.map((l, i) => {
                  const q = Number(l.quantity);
                  const min = l.min_stock != null ? Number(l.min_stock) : null;
                  const low = min != null && q <= min;
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-3 font-medium">{l.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{l.store_name}</td>
                      <td className="px-4 py-3 text-right">{q} {l.unit}</td>
                      <td className="px-4 py-3 text-right text-ink-soft">{l.min_stock ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-ink-soft">{l.max_stock ?? '—'}</td>
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
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Journal des mouvements (append-only)</h2>
        {movements.rowCount === 0 ? (
          <EmptyState
            icon="∅"
            title="Aucun mouvement enregistré"
            description="Les mouvements sont écrits automatiquement par les ventes, achats et inventaires."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-soft text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Produit</th>
                  <th className="text-left px-4 py-3">Boutique</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-right px-4 py-3">Δ</th>
                  <th className="text-right px-4 py-3">Avant → Après</th>
                  <th className="text-left px-4 py-3">Motif / Utilisateur</th>
                </tr>
              </thead>
              <tbody>
                {movements.rows.map((m) => {
                  const t = TYPE_LABEL[m.movement_type] ?? { label: m.movement_type, tone: 'neutral' as const };
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
                      <td className="px-4 py-3 text-xs text-ink-soft">
                        {m.reason ?? '—'}{m.user_name ? ` · ${m.user_name}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
