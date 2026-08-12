import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { customerInputSchema } from '@/lib/validation/customer';
import { audit } from '@/lib/audit/log';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const cust = await query(
    `SELECT id, type, first_name, last_name, company_name, email, phone,
            siret, siren, vat_number, public_service_code, commitment_number,
            address, consent_email, consent_sms,
            internal_notes, loyalty_code, default_discount_pct, loyalty_enabled,
            payment_terms, billing_frequency, created_at, archived_at
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

  // Total fidélité tous groupes (fidélité segmentée possible en Croissance+).
  const loyalty = await query<{ total: string | null }>(
    `SELECT SUM(points_balance)::text AS total FROM loyalty_accounts WHERE customer_id = $1`,
    [params.id],
  );

  return NextResponse.json({
    customer: cust.rows[0],
    sales: sales.rows,
    loyalty_points: loyalty.rows[0]?.total != null ? Number(loyalty.rows[0].total) : null,
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, customerInputSchema);
  if ('response' in parsed) return parsed.response;
  const c = parsed.data;

  const email = c.email && c.email.length > 0 ? c.email : null;
  const res = await query(
    `UPDATE customers SET
       type = $3, first_name = $4, last_name = $5, company_name = $6,
       email = $7, phone = $8, siret = $9, siren = $10, vat_number = $11,
       public_service_code = $12, commitment_number = $13,
       address = $14, consent_email = $15, consent_sms = $16,
       internal_notes = $17, loyalty_code = $18,
       default_discount_pct = $19, loyalty_enabled = $20,
       payment_terms = $21, billing_frequency = $22,
       updated_by = $23, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      params.id, g.user.organizationId, c.type,
      c.first_name ?? null, c.last_name ?? null, c.company_name ?? null,
      email, c.phone ?? null, c.siret ?? null, c.siren ?? null, c.vat_number ?? null,
      c.public_service_code ?? null, c.commitment_number ?? null,
      JSON.stringify(c.address ?? {}),
      c.consent_email ?? false, c.consent_sms ?? false,
      c.internal_notes ?? null, c.loyalty_code ?? null,
      c.default_discount_pct ?? null, c.loyalty_enabled ?? true,
      c.payment_terms ?? null, c.billing_frequency ?? 'manual',
      g.user.id,
    ],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'customers.update', entityType: 'customer', entityId: params.id,
    payload: { type: c.type },
  });
  return NextResponse.json({ ok: true });
}
