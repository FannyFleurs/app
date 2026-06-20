import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';

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

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const user = (await readSessionFromCookie())!;

  const inv = await query<{
    id: string; number: string | null; invoice_type: string; status: string;
    issue_date: string | null; service_date: string | null; due_date: string | null;
    total_ht: string; total_tva: string; total_ttc: string;
    tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
    payment_terms: string | null; legal_mentions: string | null; notes: string | null;
    fiscal_hash: string | null;
    customer_id: string;
    customer_display: string | null; customer_email: string | null;
    customer_address: { line1?: string; zip?: string; city?: string } | null;
    customer_siret: string | null; customer_vat: string | null;
    org_name: string; org_legal: string; org_siret: string | null; org_vat: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
  }>(
    `SELECT i.id, i.number, i.invoice_type, i.status, i.issue_date, i.service_date, i.due_date,
            i.total_ht::text, i.total_tva::text, i.total_ttc::text, i.tva_breakdown,
            i.payment_terms, i.legal_mentions, i.notes, i.fiscal_hash, c.id AS customer_id,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_display,
            c.email AS customer_email, c.address AS customer_address,
            c.siret AS customer_siret, c.vat_number AS customer_vat,
            o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.vat_number AS org_vat, o.address AS org_address
       FROM invoices i
       JOIN organizations o ON o.id = i.organization_id
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [params.id, user.organizationId],
  );
  if (inv.rowCount === 0) notFound();
  const i = inv.rows[0]!;

  const lines = await query<{
    label: string; quantity: string; unit_price_ht: string;
    discount_pct: string; tax_rate: string; line_ht: string; line_tva: string; line_ttc: string;
  }>(
    `SELECT label, quantity::text, unit_price_ht::text, discount_pct::text,
            tax_rate::text, line_ht::text, line_tva::text, line_ttc::text
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_index`,
    [params.id],
  );

  const s = STATUS[i.status] ?? { label: i.status, tone: 'neutral' as const };

  return (
    <div className="p-8 space-y-5">
      <Link href="/invoices" className="text-sm text-ink-soft hover:text-ink">← Toutes les factures</Link>

      <PageHeader
        title={i.number ?? 'Facture (brouillon)'}
        subtitle={`Émise le ${i.issue_date ?? '—'}${i.due_date ? ` · Échéance ${i.due_date}` : ''}`}
        badge={{ label: s.label, tone: s.tone === 'success' || s.tone === 'warning' ? s.tone : 'soft' }}
        actions={(
          <>
            <button className="btn-soft" disabled title="Phase 2">Télécharger PDF</button>
            <button className="btn-soft" disabled title="Phase 2">Envoyer par email</button>
          </>
        )}
      />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="text-xs uppercase tracking-wider text-ink-soft mb-2">Émetteur</h3>
          <div className="font-semibold">{i.org_name}</div>
          <div className="text-sm text-ink-soft">{i.org_legal}</div>
          <div className="text-sm mt-2">{i.org_address?.line1}</div>
          <div className="text-sm">{[i.org_address?.zip, i.org_address?.city].filter(Boolean).join(' ')}</div>
          <div className="text-xs text-ink-soft mt-2">
            {i.org_siret && <>SIRET {i.org_siret}<br /></>}
            {i.org_vat && <>TVA {i.org_vat}</>}
          </div>
        </div>
        <div className="card p-5">
          <h3 className="text-xs uppercase tracking-wider text-ink-soft mb-2">Client</h3>
          <Link href={`/customers/${i.customer_id}`} className="font-semibold hover:underline">
            {i.customer_display ?? 'Client'}
          </Link>
          {i.customer_email && <div className="text-sm text-ink-soft">{i.customer_email}</div>}
          <div className="text-sm mt-2">{i.customer_address?.line1}</div>
          <div className="text-sm">{[i.customer_address?.zip, i.customer_address?.city].filter(Boolean).join(' ')}</div>
          <div className="text-xs text-ink-soft mt-2">
            {i.customer_siret && <>SIRET {i.customer_siret}<br /></>}
            {i.customer_vat && <>TVA {i.customer_vat}</>}
          </div>
        </div>
      </section>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Désignation</th>
              <th className="text-right px-4 py-3">Qté</th>
              <th className="text-right px-4 py-3">PU HT</th>
              <th className="text-right px-4 py-3">Remise</th>
              <th className="text-right px-4 py-3">TVA</th>
              <th className="text-right px-4 py-3">HT</th>
              <th className="text-right px-4 py-3">TTC</th>
            </tr>
          </thead>
          <tbody>
            {lines.rowCount === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-soft">Aucune ligne.</td></tr>
            ) : lines.rows.map((l, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-4 py-3">{l.label}</td>
                <td className="px-4 py-3 text-right">{l.quantity}</td>
                <td className="px-4 py-3 text-right">{formatEUR(Number(l.unit_price_ht))}</td>
                <td className="px-4 py-3 text-right">{Number(l.discount_pct) > 0 ? `${l.discount_pct}%` : '—'}</td>
                <td className="px-4 py-3 text-right">{l.tax_rate}%</td>
                <td className="px-4 py-3 text-right">{formatEUR(Number(l.line_ht))}</td>
                <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(l.line_ttc))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Récapitulatif TVA</h3>
          {(i.tva_breakdown ?? []).length === 0 ? (
            <p className="text-sm text-ink-soft">—</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {i.tva_breakdown.map((b, idx) => (
                  <tr key={idx} className="border-t border-border first:border-t-0">
                    <td className="py-2">TVA {b.rate}%</td>
                    <td className="py-2 text-right text-ink-soft">Base {formatEUR(b.base_ht)}</td>
                    <td className="py-2 text-right">{formatEUR(b.tva)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card p-5">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-soft">Total HT</span><span>{formatEUR(Number(i.total_ht))}</span></div>
            <div className="flex justify-between"><span className="text-ink-soft">Total TVA</span><span>{formatEUR(Number(i.total_tva))}</span></div>
            <div className="flex justify-between items-baseline border-t border-border pt-2">
              <span className="font-semibold">Total TTC</span>
              <span className="text-2xl font-semibold tracking-tight">{formatEUR(Number(i.total_ttc))}</span>
            </div>
          </div>
        </div>
      </section>

      {(i.payment_terms || i.legal_mentions || i.notes) && (
        <section className="card p-5 text-sm text-ink-soft space-y-3">
          {i.payment_terms && <div><span className="font-medium text-ink">Conditions :</span> {i.payment_terms}</div>}
          {i.legal_mentions && <div><span className="font-medium text-ink">Mentions légales :</span> {i.legal_mentions}</div>}
          {i.notes && <div><span className="font-medium text-ink">Notes :</span> {i.notes}</div>}
        </section>
      )}

      {i.fiscal_hash && (
        <div className="text-xs text-ink-soft font-mono">
          Empreinte fiscale : {i.fiscal_hash.slice(0, 32)}…
        </div>
      )}
    </div>
  );
}
