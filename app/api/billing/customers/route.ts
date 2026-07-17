import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/**
 * Facturation « en compte » — liste des clients ayant un solde en compte
 * négatif (ils doivent de l'argent). Pour chacun : nombre de tickets « en
 * compte » non encore facturés et factures de période en attente de règlement.
 */
export async function GET() {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const rows = await query<{
    id: string;
    name: string | null;
    account_balance: string;
    uninvoiced_count: string;
    pending_invoices: string;
    pending_ttc: string;
  }>(
    `SELECT c.id,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS name,
            COALESCE(c.account_balance, 0)::text AS account_balance,
            (SELECT COUNT(*) FROM sales s
               WHERE s.customer_id = c.id
                 AND s.organization_id = c.organization_id
                 AND s.status = 'validated'
                 AND s.account_invoice_id IS NULL
                 AND EXISTS (SELECT 1 FROM payments p
                               WHERE p.sale_id = s.id AND p.method = 'deferred')
            )::text AS uninvoiced_count,
            (SELECT COUNT(*) FROM invoices i
               WHERE i.customer_id = c.id
                 AND i.organization_id = c.organization_id
                 AND i.status IN ('validated','sent','partially_paid','overdue')
            )::text AS pending_invoices,
            (SELECT COALESCE(SUM(i.total_ttc), 0) FROM invoices i
               WHERE i.customer_id = c.id
                 AND i.organization_id = c.organization_id
                 AND i.status IN ('validated','sent','partially_paid','overdue')
            )::text AS pending_ttc
       FROM customers c
      WHERE c.organization_id = $1
        AND COALESCE(c.account_balance, 0) < 0
      ORDER BY c.account_balance ASC`,
    [g.user.organizationId],
  );

  return NextResponse.json({
    customers: rows.rows.map((r) => ({
      id: r.id,
      name: r.name || 'Client',
      account_balance: Number(r.account_balance),
      uninvoiced_count: Number(r.uninvoiced_count),
      pending_invoices: Number(r.pending_invoices),
      pending_ttc: Number(r.pending_ttc),
    })),
  });
}
