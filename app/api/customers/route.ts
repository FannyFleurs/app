import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { customerInputSchema } from '@/lib/validation/customer';
import { audit } from '@/lib/audit/log';

export async function GET(req: Request) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim().toLowerCase();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

  const params: unknown[] = [g.user.organizationId];
  let where = `organization_id = $1 AND is_anonymized = FALSE`;
  if (q) {
    params.push(`%${q}%`);
    params.push(q);
    where += ` AND (
      lower(COALESCE(company_name,'')) LIKE $${params.length - 1}
      OR lower(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE $${params.length - 1}
      OR lower(COALESCE(email,'')) LIKE $${params.length - 1}
      OR COALESCE(phone,'') = $${params.length}
      OR COALESCE(siret,'') = $${params.length}
    )`;
  }
  params.push(limit);

  const { rows } = await query(
    `SELECT id, type, first_name, last_name, company_name, email, phone,
            siret, vat_number, address, loyalty_code, default_discount_pct,
            COALESCE(company_name, NULLIF(TRIM(CONCAT(first_name,' ',last_name)), '')) AS display_name,
            created_at
       FROM customers
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return NextResponse.json({ customers: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, customerInputSchema);
  if ('response' in parsed) return parsed.response;
  const c = parsed.data;

  const email = c.email && c.email.length > 0 ? c.email : null;
  const ins = await query<{ id: string }>(
    `INSERT INTO customers
       (organization_id, type, first_name, last_name, company_name,
        email, phone, siret, vat_number, address,
        consent_email, consent_sms, internal_notes, loyalty_code,
        default_discount_pct,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
     RETURNING id`,
    [
      g.user.organizationId, c.type,
      c.first_name ?? null, c.last_name ?? null, c.company_name ?? null,
      email, c.phone ?? null, c.siret ?? null, c.vat_number ?? null,
      JSON.stringify(c.address ?? {}),
      c.consent_email ?? false, c.consent_sms ?? false,
      c.internal_notes ?? null, c.loyalty_code ?? null,
      c.default_discount_pct ?? null,
      g.user.id,
    ],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'customers.create', entityType: 'customer', entityId: ins.rows[0]!.id,
    payload: { type: c.type, display: c.company_name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() },
  });

  return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
}
