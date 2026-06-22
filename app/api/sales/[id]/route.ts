import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const sale = await query(
    `SELECT * FROM sales WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (sale.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const lines = await query(
    `SELECT * FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
    [params.id],
  );
  const payments = await query(
    `SELECT method, amount, given_amount, change_amount, reference
       FROM payments WHERE sale_id = $1 ORDER BY created_at`,
    [params.id],
  );
  const invoice = await query<{ id: string; number: string }>(
    `SELECT id, number FROM invoices
      WHERE sale_id = $1 AND organization_id = $2 AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 1`,
    [params.id, g.user.organizationId],
  );
  return NextResponse.json({
    sale: sale.rows[0],
    lines: lines.rows,
    payments: payments.rows,
    invoice: invoice.rows[0] ?? null,
  });
}
