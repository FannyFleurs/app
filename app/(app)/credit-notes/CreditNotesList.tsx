'use client';

import { useEffect, useMemo, useState } from 'react';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import TicketPrintButton from '@/components/TicketPrintButton';
import { formatEUR } from '@/lib/services/money';

interface CreditNote {
  id: string;
  number: string;
  amount: string;
  used_amount: string;
  status: string;
  issued_at: string;
  reason: string;
  sale_id: string | null;
  receipt_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'soft' }> = {
  open:            { label: 'Disponible',     tone: 'success' },
  partially_used:  { label: 'Partiel',        tone: 'soft' },
  used:            { label: 'Utilisé',        tone: 'neutral' },
  cancelled:       { label: 'Annulé',         tone: 'danger' },
};

export default function CreditNotesList() {
  const [items, setItems] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'used' | 'cancelled'>('open');

  useEffect(() => {
    setLoading(true);
    fetch('/api/credit-notes')
      .then((r) => r.json())
      .then((j) => setItems(j.credit_notes ?? []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((c) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'used' && c.status !== 'used') return false;
        if (statusFilter === 'cancelled' && c.status !== 'cancelled') return false;
        if (statusFilter === 'open' && c.status !== 'open' && c.status !== 'partially_used') return false;
      }
      if (!needle) return true;
      return (
        c.number.toLowerCase().includes(needle) ||
        c.customer_name?.toLowerCase().includes(needle) ||
        c.receipt_number?.toLowerCase().includes(needle)
      );
    });
  }, [items, q, statusFilter]);

  const totals = useMemo(() => {
    let issued = 0, remaining = 0;
    for (const c of items) {
      issued += Number(c.amount);
      if (c.status === 'open' || c.status === 'partially_used') {
        remaining += Number(c.amount) - Number(c.used_amount);
      }
    }
    return { count: items.length, issued, remaining };
  }, [items]);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Avoirs</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Liste des avoirs émis (retours produits). Réimprimez un avoir directement sur l’imprimante ticket (PDF en repli).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Kpi label="Avoirs émis" value={totals.count.toString()} />
        <Kpi label="Montant total" value={formatEUR(totals.issued)} />
        <Kpi label="Reste à utiliser" value={formatEUR(totals.remaining)} tone="success" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            className="input pr-9"
            placeholder="Rechercher (numéro, client, ticket)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all', 'open', 'used', 'cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                statusFilter === f ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border hover:border-gray-300'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'open' ? 'Disponibles' : f === 'used' ? 'Utilisés' : 'Annulés'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="↩"
          title={items.length === 0 ? 'Aucun avoir émis' : 'Aucun résultat'}
          description={items.length === 0
            ? 'Les avoirs sont créés depuis le détail d\'une vente (Retour produit).'
            : 'Modifiez les filtres pour voir d\'autres avoirs.'}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Numéro</th>
                <th className="text-left px-4 py-3 font-semibold">Émis le</th>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">Ticket d&apos;origine</th>
                <th className="text-center px-4 py-3 font-semibold">Statut</th>
                <th className="text-right px-4 py-3 font-semibold">Montant</th>
                <th className="text-right px-4 py-3 font-semibold">Restant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const remaining = Number(c.amount) - Number(c.used_amount);
                const status = STATUS_LABEL[c.status] ?? { label: c.status, tone: 'neutral' as const };
                return (
                  <tr key={c.id} className="border-t border-border hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{c.number}</td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(c.issued_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      {c.customer_name ?? <span className="text-ink-soft italic">Anonyme</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                      {c.receipt_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(c.amount))}</td>
                    <td className="px-4 py-3 text-right text-success font-medium">
                      {remaining > 0 ? formatEUR(remaining) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TicketPrintButton
                        url={`/api/credit-notes/${c.id}/print`}
                        pdfUrl={`/api/credit-notes/${c.id}/pdf`}
                      />
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${tone === 'success' ? 'text-success' : ''}`}>
        {value}
      </div>
    </div>
  );
}
