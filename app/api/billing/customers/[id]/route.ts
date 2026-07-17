import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/**
 * Détail facturation d'un client :
 *   - tickets « en compte » validés non encore facturés (regroupables en une
 *     facture de période) ;
 *   - factures de période en attente de règlement (à solder).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const customer = await query<{
    id: string; name: string | null; account_balance: string;
  }>(
    `SELECT id,
            COALESCE(company_name, NULLIF(TRIM(CONCAT(first_name,' ',last_name)), '')) AS name,
            COALESCE(account_balance, 0)::text AS account_balance
       FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (customer.rowCount === 0) {
    return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });
  }

  const sales = await query<{
    id: string; receipt_number: string | null;
    validated_at: string | null; total_ttc: string; deferred_amount: string;
  }>(
    `SELECT s.id, s.receipt_number, s.validated_at, s.total_ttc::text,
            COALESCE((SELECT SUM(p.amount) FROM payments p
                        WHERE p.sale_id = s.id AND p.method = 'deferred'), 0)::text AS deferred_amount
       FROM sales s
      WHERE s.customer_id = $1
        AND s.organization_id = $2
        AND s.status = 'validated'
        AND s.account_invoice_id IS NULL
        AND EXISTS (SELECT 1 FROM payments p
                      WHERE p.sale_id = s.id AND p.method = 'deferred')
      ORDER BY s.validated_at ASC`,
    [params.id, g.user.organizationId],
  );

  const invoices = await query<{
    id: string; number: string | null; issue_date: string | null;
    due_date: string | null; total_ttc: string; status: string;
  }>(
    `SELECT id, number, issue_date, due_date, total_ttc::text, status
       FROM invoices
      WHERE customer_id = $1
        AND organization_id = $2
        AND status IN ('validated','sent','partially_paid','overdue')
      ORDER BY COALESCE(issue_date, created_at::date) DESC`,
    [params.id, g.user.organizationId],
  );

  return NextResponse.json({
    customer: {
      id: customer.rows[0]!.id,
      name: customer.rows[0]!.name || 'Client',
      account_balance: Number(customer.rows[0]!.account_balance),
    },
    sales: sales.rows.map((s) => ({
      id: s.id,
      receipt_number: s.receipt_number,
      validated_at: s.validated_at ? new Date(s.validated_at).toISOString() : null,
      total_ttc: Number(s.total_ttc),
      deferred_amount: Number(s.deferred_amount),
    })),
    invoices: invoices.rows.map((i) => ({
      id: i.id,
      number: i.number,
      issue_date: i.issue_date,
      due_date: i.due_date,
      total_ttc: Number(i.total_ttc),
      status: i.status,
    })),
  });
}
