import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const cust = await query(
    `SELECT id, type, first_name, last_name, company_name, email, phone,
            siret, vat_number, address, consent_email, consent_sms,
            internal_notes, loyalty_code, created_at
       FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cust.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const sales = await query(
    `SELECT id, receipt_number, total_ttc::text, validated_at
       FROM sales
      WHERE customer_id = $1 AND status = 'validated'
      ORDER BY validated_at DESC LIMIT 50`,
    [params.id],
  );

  const loyalty = await query<{ points_balance: number }>(
    `SELECT points_balance FROM loyalty_accounts WHERE customer_id = $1`,
    [params.id],
  );

  return NextResponse.json({
    customer: cust.rows[0],
    sales: sales.rows,
    loyalty_points: loyalty.rows[0]?.points_balance ?? null,
  });
}
