'use client';
import { confirmThemed, alertThemed } from '@/lib/ui/dialog';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface Order {
  source: 'order' | 'sale';
  id: string;
  number: string | null;
  status: string;
  pickup_or_delivery: string;
  requested_at: string | null;
  slot_label: string | null;
  total_amount: string;
  deposit_amount: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  delivery_address: { line1?: string; zip?: string; city?: string } | null;
  internal_notes: string | null;
  card_message: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  payment_status?: 'pending' | 'paid' | 'failed' | 'refunded' | null;
  payment_link_url?: string | null;
  paid_at?: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'soft' | 'warning' | 'success' | 'danger' }> = {
  draft:          { label: 'Brouillon',     tone: 'neutral' },
  confirmed:      { label: 'Confirmée',     tone: 'soft' },
  in_preparation: { label: 'En préparation',tone: 'warning' },
  ready:          { label: 'Prête',         tone: 'success' },
  delivered:      { label: 'Livrée / Remise', tone: 'success' },
  cancelled:      { label: 'Annulée',       tone: 'danger' },
};

const FILTERS: Array<{ key: string; label: string; statuses?: string[] }> = [
  { key: 'all',         label: 'Toutes' },
  { key: 'today',       label: 'Aujourd\'hui' },
  { key: 'upcoming',    label: 'À venir' },
  { key: 'in_preparation', label: 'En préparation', statuses: ['in_preparation'] },
  { key: 'ready',       label: 'Prête', statuses: ['ready'] },
  { key: 'paid',        label: 'Payée' },
  { key: 'unpaid',      label: 'Impayée' },
  { key: 'cancelled',   label: 'Annulée', statuses: ['cancelled'] },
];

export default function OrdersClient({ orgId: _orgId }: { orgId: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('today');
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/orders');
    if (r.ok) setOrders((await r.json()).orders ?? []);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return orders.filter((o) => {
      if (filter === 'all') return true;
      if (filter === 'today') {
        return o.requested_at && new Date(o.requested_at).toDateString() === today.toDateString();
      }
      if (filter === 'upcoming') {
        return o.requested_at && new Date(o.requested_at) > today
          && !['delivered', 'cancelled'].includes(o.status);
      }
      if (filter === 'paid') return o.payment_status === 'paid';
      if (filter === 'unpaid') return o.payment_status !== 'paid' && o.status !== 'cancelled';
      const f = FILTERS.find((x) => x.key === filter);
      if (f?.statuses) return f.statuses.includes(o.status);
      return true;
    });
  }, [orders, filter]);

  const kpis = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return {
      total: orders.length,
      today: orders.filter((o) => o.requested_at && new Date(o.requested_at).toDateString() === today.toDateString()).length,
      upcoming: orders.filter((o) => o.requested_at && new Date(o.requested_at) > today && !['delivered', 'cancelled'].includes(o.status)).length,
      in_prep: orders.filter((o) => o.status === 'in_preparation').length,
    };
  }, [orders]);

  async function setStatus(item: Order, status: string) {
    setBusy(true);
    // Routing : commande différée → /api/orders, vente caisse → /api/sales
    const url = item.source === 'sale'
      ? `/api/sales/${item.id}/prep-status`
      : `/api/orders/${item.id}`;
    const body = item.source === 'sale'
      ? { prep_status: status }
      : { status };
    const r = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      setSelected((cur) => cur && cur.id === item.id ? { ...cur, status } : cur);
      void reload();
    }
  }

  async function cancel(item: Order) {
    if (!(await confirmThemed({ message: 'Annuler cette commande ?' }))) return;
    setBusy(true);
    if (item.source === 'sale') {
      // Pour une vente : on passe juste prep_status='cancelled'
      // (la vente reste fiscalement validée, c'est juste la préparation
      // qui est annulée — la trésorerie a déjà été enregistrée).
      await fetch(`/api/sales/${item.id}/prep-status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prep_status: 'cancelled' }),
      });
    } else {
      await fetch(`/api/orders/${item.id}`, { method: 'DELETE' });
    }
    setBusy(false);
    setSelected(null);
    void reload();
  }

  async function generateStripeLink(item: Order) {
    setBusy(true);
    const url = item.source === 'sale'
      ? `/api/sales/${item.id}/payment-link`
      : `/api/orders/${item.id}/payment-link`;
    const r = await fetch(url, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      void alertThemed({ message: j.message ?? j.error ?? 'Erreur' });
      return;
    }
    const j = await r.json();
    if (j.email_sent_to) {
      void alertThemed({ message: `✓ Lien envoyé à ${j.email_sent_to}` });
    } else {
      try { await navigator.clipboard?.writeText(j.url); } catch {}
      void alertThemed({ message: `Lien créé :\n${j.url}\n\n(Copié dans le presse-papier.)` });
    }
    void reload();
  }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Commandes"
        subtitle="Commandes clients avec retrait ou livraison."
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={kpis.total.toString()} />
        <Kpi label="Aujourd'hui" value={kpis.today.toString()} />
        <Kpi label="À venir" value={kpis.upcoming.toString()} />
        <Kpi label="En préparation" value={kpis.in_prep.toString()} />
      </section>

      <div className="card p-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              filter === f.key
                ? 'accent-bar text-white border-transparent'
                : 'bg-white text-ink border-border hover:border-gray-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="✿"
          title={orders.length === 0 ? 'Aucune commande' : 'Aucun résultat'}
          description={orders.length === 0
            ? 'Les commandes saisies depuis la caisse (bouton « Commande ») apparaissent ici.'
            : 'Aucune commande ne correspond à ce filtre.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">N°</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Client / Destinataire</th>
                <th className="text-left px-4 py-3">Prévu</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-center px-4 py-3">Paiement</th>
                <th className="text-right px-4 py-3">Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const s = STATUS_LABEL[o.status] ?? { label: o.status, tone: 'neutral' as const };
                const paid = o.payment_status === 'paid';
                return (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="border-t border-border hover:bg-bg/60 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{o.number ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customer_name ?? '—'}</div>
                      {o.recipient_name && o.recipient_name !== o.customer_name && (
                        <div className="text-xs text-ink-soft">→ {o.recipient_name}</div>
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
                        {o.pickup_or_delivery === 'delivery' ? '🚚 Livraison' : '📦 Retrait'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {paid ? <Badge tone="success">Payée</Badge>
                        : o.payment_link_url ? <Badge tone="soft">Lien envoyé</Badge>
                        : <Badge tone="warning">Impayée</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(o.total_amount))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onChangeStatus={(s) => void setStatus(selected, s)}
          onCancel={() => void cancel(selected)}
          onGenerateLink={() => void generateStripeLink(selected)}
          busy={busy}
        />
      )}
    </div>
  );
}

function OrderDetail({
  order, onClose, onChangeStatus, onCancel, onGenerateLink, busy,
}: {
  order: Order;
  onClose: () => void;
  onChangeStatus: (s: string) => void;
  onCancel: () => void;
  onGenerateLink: () => void;
  busy: boolean;
}) {
  const s = STATUS_LABEL[order.status] ?? { label: order.status, tone: 'neutral' as const };
  const paid = order.payment_status === 'paid';
  const next: Record<string, string | null> = {
    draft: 'confirmed',
    confirmed: 'in_preparation',
    in_preparation: 'ready',
    ready: 'delivered',
    delivered: null,
    cancelled: null,
  };
  const nextStatus = next[order.status];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end md:place-items-center bg-ink/30 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-semibold">
              Commande {order.number ?? <span className="font-mono text-xs">{order.id.slice(0,8)}</span>}
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              <Badge tone={s.tone}>{s.label}</Badge>
              {' · '}
              {order.pickup_or_delivery === 'delivery' ? 'Livraison' : 'Retrait boutique'}
              {order.source === 'sale' && (
                <> {' · '} <Badge tone="soft">Vente caisse</Badge></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center h-10 w-10 rounded-full border border-border text-ink-soft hover:bg-gray-50"
          >✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <section>
            <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Client</h3>
            <div className="text-sm font-medium">{order.customer_name ?? '—'}</div>
            <div className="text-xs text-ink-soft space-y-0.5 mt-1">
              {order.customer_email && <div>✉ {order.customer_email}</div>}
              {order.customer_phone && <div>☎ {order.customer_phone}</div>}
            </div>
          </section>

          {(order.recipient_name || order.recipient_phone) && order.recipient_name !== order.customer_name && (
            <section>
              <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Destinataire</h3>
              <div className="text-sm font-medium">{order.recipient_name ?? '—'}</div>
              {order.recipient_phone && <div className="text-xs text-ink-soft">☎ {order.recipient_phone}</div>}
            </section>
          )}

          {order.pickup_or_delivery === 'delivery' && order.delivery_address && (
            <section>
              <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Adresse de livraison</h3>
              <div className="text-sm">
                {order.delivery_address.line1}<br />
                {order.delivery_address.zip} {order.delivery_address.city}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">
              {order.pickup_or_delivery === 'delivery' ? 'Livraison prévue' : 'Retrait prévu'}
            </h3>
            <div className="text-sm">
              {order.requested_at ? new Date(order.requested_at).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            {order.slot_label && <div className="text-xs text-ink-soft">{order.slot_label}</div>}
          </section>

          {order.card_message && (
            <section>
              <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Message carte</h3>
              <div className="rounded-xl bg-accent-soft px-3 py-2 text-sm italic">« {order.card_message} »</div>
            </section>
          )}

          {order.internal_notes && (
            <section>
              <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Notes internes</h3>
              <div className="text-sm whitespace-pre-wrap text-ink-soft">{order.internal_notes}</div>
            </section>
          )}

          <section>
            <h3 className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-1">Paiement</h3>
            <div className="flex items-baseline justify-between text-sm">
              <span>Total TTC</span>
              <strong className="text-lg">{formatEUR(Number(order.total_amount))}</strong>
            </div>
            {Number(order.deposit_amount) > 0 && (
              <div className="flex items-baseline justify-between text-xs text-ink-soft">
                <span>Acompte</span>
                <span>{formatEUR(Number(order.deposit_amount))}</span>
              </div>
            )}
            <div className="mt-2">
              {paid ? (
                <div className="text-xs text-success">
                  ✓ Payée {order.paid_at && `le ${new Date(order.paid_at).toLocaleString('fr-FR')}`}
                </div>
              ) : order.payment_link_url ? (
                <div className="text-xs text-warning">
                  Lien Stripe en attente.{' '}
                  <a href={order.payment_link_url} target="_blank" rel="noreferrer" className="underline">
                    Ouvrir le lien
                  </a>
                </div>
              ) : (
                <button
                  onClick={onGenerateLink}
                  disabled={busy || order.status === 'cancelled'}
                  className="btn-soft text-xs h-9"
                >
                  Générer un lien Stripe
                </button>
              )}
            </div>
          </section>
        </div>

        <div className="border-t border-border px-4 md:px-6 py-3 flex flex-wrap gap-2 shrink-0">
          {nextStatus && (
            <button
              onClick={() => onChangeStatus(nextStatus)}
              disabled={busy}
              className="btn-primary text-sm flex-1 min-w-[140px]"
            >
              {nextStatus === 'confirmed' && 'Confirmer'}
              {nextStatus === 'in_preparation' && 'Passer en préparation'}
              {nextStatus === 'ready' && 'Marquer prête'}
              {nextStatus === 'delivered' && (order.pickup_or_delivery === 'delivery' ? 'Marquer livrée' : 'Marquer remise')}
            </button>
          )}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button
              onClick={onCancel}
              disabled={busy}
              className="btn-ghost text-sm text-danger"
            >
              Annuler la commande
            </button>
          )}
          <button onClick={onClose} className="btn-ghost text-sm">Fermer</button>
        </div>
      </div>
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
