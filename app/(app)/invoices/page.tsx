import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import {
  EINVOICING_KEY,
  mergeEInvoicingDefaults,
  type EInvoicingSettings,
} from '@/lib/settings/einvoicing';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'soft' | 'warning' | 'success' | 'danger' }> = {
  draft:          { label: 'Brouillon',       tone: 'neutral' },
  validated:      { label: 'Validée',         tone: 'soft' },
  sent:           { label: 'Envoyée',         tone: 'soft' },
  paid:           { label: 'Payée',           tone: 'success' },
  partially_paid: { label: 'Partiellement payée', tone: 'warning' },
  overdue:        { label: 'En retard',       tone: 'danger' },
  cancelled:      { label: 'Annulée',         tone: 'danger' },
};

const TYPE: Record<string, string> = {
  standard:    'Facture',
  proforma:    'Pro forma',
  deposit:     'Acompte',
  balance:     'Solde',
  credit_note: 'Avoir',
};

export default async function InvoicesPage() {
  const user = (await readSessionFromCookie())!;

  const invoices = await query<{
    id: string; number: string | null; invoice_type: string; status: string;
    issue_date: string | null; due_date: string | null;
    total_ttc: string; total_ht: string;
    customer_display: string | null;
  }>(
    `SELECT i.id, i.number, i.invoice_type, i.status, i.issue_date, i.due_date,
            i.total_ttc::text, i.total_ht::text,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.organization_id = $1
      ORDER BY COALESCE(i.issue_date, i.created_at::date) DESC LIMIT 200`,
    [user.organizationId],
  );

  // E-facturation : le lien "Export e-facture (JSON)" n'apparait que si
  // la preparation est activee dans les reglages.
  const eRow = await query<{ value: Partial<EInvoicingSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, EINVOICING_KEY],
  );
  const eInvoicing = mergeEInvoicingDefaults(eRow.rows[0]?.value ?? null);

  const totalTtc = invoices.rows.reduce((s, i) => s + Number(i.total_ttc), 0);
  const overdueCount = invoices.rows.filter((i) => i.status === 'overdue').length;
  const unpaidTtc = invoices.rows
    .filter((i) => ['validated', 'sent', 'partially_paid', 'overdue'].includes(i.status))
    .reduce((s, i) => s + Number(i.total_ttc), 0);

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Factures"
        subtitle="B2C, B2B, pro forma, acomptes, soldes et avoirs. Numérotation séquentielle sans rupture."
        actions={null}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total" value={invoices.rowCount.toString()} />
        <Kpi label="CA facturé" value={formatEUR(totalTtc)} />
        <Kpi label="En attente règlement" value={formatEUR(unpaidTtc)} />
        <Kpi label="En retard" value={overdueCount.toString()} tone={overdueCount > 0 ? 'danger' : undefined} />
      </section>

      {invoices.rowCount === 0 ? (
        <EmptyState
          icon="◼"
          title="Aucune facture émise"
          description="Les factures B2C/B2B, acomptes, soldes et avoirs apparaîtront ici. La création est prévue en Phase 2."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">N°</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Client</th>
                <th className="text-left px-4 py-3">Émise le</th>
                <th className="text-left px-4 py-3">Échéance</th>
                <th className="text-right px-4 py-3">HT</th>
                <th className="text-right px-4 py-3">TTC</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.rows.map((i) => {
                const s = STATUS[i.status] ?? { label: i.status, tone: 'neutral' as const };
                return (
                  <tr key={i.id} className="border-t border-border hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/invoices/${i.id}`} className="hover:underline">
                        {i.number ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{TYPE[i.invoice_type] ?? i.invoice_type}</td>
                    <td className="px-4 py-3 font-medium">{i.customer_display ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{i.issue_date ?? '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{i.due_date ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{formatEUR(Number(i.total_ht))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(i.total_ttc))}</td>
                    <td className="px-4 py-3"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/invoices/${i.id}/pdf`}
                        target="_blank" rel="noreferrer"
                        className="text-accent-deep text-sm hover:underline mr-3"
                      >
                        PDF
                      </a>
                      {eInvoicing.enabled && (
                        <a
                          href={`/api/invoices/${i.id}/e-invoice?download=1`}
                          className="text-accent-deep text-sm hover:underline mr-3"
                          title="Export e-facture (JSON normalisé)"
                        >
                          JSON
                        </a>
                      )}
                      <Link href={`/invoices/${i.id}`} className="text-accent-deep text-sm hover:underline">
                        Détail
                      </Link>
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

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight ${tone === 'danger' ? 'text-danger' : ''}`}>{value}</div>
    </div>
  );
}
