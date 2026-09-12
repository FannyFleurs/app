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

  // Fiches archivées : hors de TOUTES les recherches (back-office comme
  // caisse). Elles ne redeviennent visibles que sur demande explicite —
  // l'écran « Archivés », d'où l'on peut les remettre en service.
  const archived = url.searchParams.get('archived');

  const params: unknown[] = [g.user.organizationId];
  let where = `organization_id = $1 AND is_anonymized = FALSE`;
  where += archived === 'only' ? ` AND archived_at IS NOT NULL` : ` AND archived_at IS NULL`;
  if (q) {
    params.push(`%${q}%`);
    const idxLike = params.length;
    params.push(q);
    const idxExact = params.length;
    const conds = [
      `lower(COALESCE(company_name,'')) LIKE $${idxLike}`,
      `lower(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) LIKE $${idxLike}`,
      `lower(COALESCE(email,'')) LIKE $${idxLike}`,
      `COALESCE(siret,'') = $${idxExact}`,
    ];
    // Recherche par téléphone insensible aux espaces / séparateurs : depuis le
    // formatage automatique (« 06 12 34 56 78 »), une égalité stricte ne
    // matchait plus une saisie « 0612345678 ». On compare chiffre à chiffre, en
    // sous-chaîne, dès qu'au moins 3 chiffres sont saisis (sinon trop large).
    const qDigits = q.replace(/[^0-9]/g, '');
    if (qDigits.length >= 3) {
      params.push(`%${qDigits}%`);
      conds.push(`regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') LIKE $${params.length}`);
    }
    where += ` AND (${conds.join(' OR ')})`;
  }
  params.push(limit);

  const { rows } = await query(
    `SELECT id, type, first_name, last_name, company_name, email, phone,
            siret, siren, vat_number, public_service_code, commitment_number,
            address, loyalty_code, default_discount_pct, archived_at,
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

  try {
  const email = c.email && c.email.length > 0 ? c.email : null;
  const ins = await query<{ id: string }>(
    `INSERT INTO customers
       (organization_id, type, first_name, last_name, company_name,
        email, phone, siret, siren, vat_number,
        public_service_code, commitment_number, address,
        consent_email, consent_sms, internal_notes, loyalty_code,
        default_discount_pct, loyalty_enabled, payment_terms, billing_frequency,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
     RETURNING id`,
    [
      g.user.organizationId, c.type,
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

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'customers.create', entityType: 'customer', entityId: ins.rows[0]!.id,
    payload: { type: c.type, display: c.company_name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() },
  });

  return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[customers.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('default_discount_pct')
      ? 'Migration manquante : exécutez `npm run db:migrate` pour appliquer 0004_customer_default_discount.sql.'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
