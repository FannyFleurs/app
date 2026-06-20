import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'soft' | 'warning' | 'success' | 'danger' }> = {
  draft:          { label: 'Brouillon',     tone: 'neutral' },
  confirmed:      { label: 'Confirmée',     tone: 'soft' },
  in_preparation: { label: 'En préparation',tone: 'warning' },
  ready:          { label: 'Prête',         tone: 'success' },
  delivered:      { label: 'Livrée',        tone: 'success' },
  cancelled:      { label: 'Annulée',       tone: 'danger' },
};

export default async function OrdersPage() {
  const user = (await readSessionFromCookie())!;

  const orders = await query<{
    id: string; number: string | null; status: string;
    pickup_or_delivery: string;
    requested_at: string | null; slot_label: string | null;
    customer_display: string | null;
    recipient_name: string | null; recipient_phone: string | null;
    total_amount: string; deposit_amount: string;
    card_message: string | null;
    created_at: string;
  }>(
    `SELECT o.id, o.number, o.status, o.pickup_or_delivery,
            o.requested_at, o.slot_label, o.recipient_name, o.recipient_phone,
            o.total_amount::text, o.deposit_amount::text, o.card_message, o.created_at,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.organization_id = $1
      ORDER BY COALESCE(o.requested_at, o.created_at) DESC LIMIT 200`,
    [user.organizationId],
  );

  const today = new Date(); today.setHours(0,0,0,0);
  const todayCount = orders.rows.filter((o) =>
    o.requested_at && new Date(o.requested_at).toDateString() === today.toDateString()
  ).length;
  const upcomingCount = orders.rows.filter((o) =>
    o.requested_at && new Date(o.requested_at) > today &&
    ['confirmed', 'in_preparation', 'ready'].includes(o.status)
  ).length;

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Commandes"
        subtitle="Bouquets, compositions, plantes commandées avec retrait ou livraison."
        badge={{ label: 'Module Phase 2 — schéma actif', tone: 'soft' }}
        actions={(
          <button className="btn-primary" disabled title="Phase 2">+ Nouvelle commande</button>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={orders.rowCount.toString()} />
        <Kpi label="Aujourd'hui" value={todayCount.toString()} />
        <Kpi label="À venir" value={upcomingCount.toString()} />
        <Kpi label="En préparation" value={orders.rows.filter(o => o.status === 'in_preparation').length.toString()} />
      </section>

      {orders.rowCount === 0 ? (
        <EmptyState
          icon="✿"
          title="Aucune commande client"
          description="Les commandes (bouquets sur mesure, compositions, livraisons) seront listées ici. La création est prévue en Phase 2."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">N°</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Client / Destinataire</th>
                <th className="text-left px-4 py-3">Date prévue</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Montant</th>
                <th className="text-right px-4 py-3">Acompte</th>
              </tr>
            </thead>
            <tbody>
              {orders.rows.map((o) => {
                const s = STATUS_LABEL[o.status] ?? { label: o.status, tone: 'neutral' as const };
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{o.number ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customer_display ?? '—'}</div>
                      {o.recipient_name && o.recipient_name !== o.customer_display && (
                        <div className="text-xs text-ink-soft">→ {o.recipient_name}</div>
                      )}
                      {o.card_message && (
                        <div className="text-xs text-ink-soft italic mt-1 max-w-xs truncate">
                          « {o.card_message} »
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {o.requested_at ? (
                        <>
                          {new Date(o.requested_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {o.slot_label && <div className="text-xs">{o.slot_label}</div>}
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={o.pickup_or_delivery === 'delivery' ? 'soft' : 'neutral'}>
                        {o.pickup_or_delivery === 'delivery' ? 'Livraison' : 'Retrait'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(o.total_amount))}</td>
                    <td className="px-4 py-3 text-right text-ink-soft">
                      {Number(o.deposit_amount) > 0 ? formatEUR(Number(o.deposit_amount)) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
