import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export async function GET() {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, code, label, rate, is_default
       FROM tax_rates
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY rate DESC`,
    [g.user.organizationId],
  );
  return NextResponse.json({ tax_rates: rows });
}
