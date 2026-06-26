import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/** Liste des avoirs (credit notes) de l'organisation. */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const search = url.searchParams.get('q')?.trim().toLowerCase();

  const params: unknown[] = [g.user.organizationId];
  let where = `cn.organization_id = $1`;
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (lower(cn.number) LIKE $${params.length}
                 OR lower(COALESCE(c.company_name,
                   TRIM(CONCAT(c.first_name,' ',c.last_name)))) LIKE $${params.length})`;
  }

  // Détection runtime de credit_notes.customer_id (migration 0014).
  const colCheck = await query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_name = 'credit_notes' AND column_name = 'customer_id'
     ) AS exists`,
  );
  const hasCustomerCol = colCheck.rows[0]?.exists ?? false;

  // Le bénéficiaire de l'avoir vient en priorité de credit_notes.customer_id
  // (migration 0014), sinon retombe sur sale.customer_id / invoice.customer_id.
  const customerExpr = hasCustomerCol
    ? `COALESCE(cn.customer_id, s.customer_id, i.customer_id)`
    : `COALESCE(s.customer_id, i.customer_id)`;

  const { rows } = await query<{
    id: string; number: string;
    amount: string; used_amount: string;
    status: string;
    issued_at: string;
    reason: string;
    sale_id: string | null;
    receipt_number: string | null;
    customer_id: string | null;
    customer_name: string | null;
  }>(
    `SELECT cn.id, cn.number,
            cn.amount::text, cn.used_amount::text,
            cn.status,
            cn.created_at AS issued_at,
            cn.reason,
            cn.sale_id,
            s.receipt_number,
            ${customerExpr} AS customer_id,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name
       FROM credit_notes cn
       LEFT JOIN sales s ON s.id = cn.sale_id
       LEFT JOIN invoices i ON i.id = cn.invoice_id
       LEFT JOIN customers c ON c.id = ${customerExpr}
      WHERE ${where}
      ORDER BY cn.created_at DESC
      LIMIT 200`,
    params,
  );

  return NextResponse.json({ credit_notes: rows });
}
