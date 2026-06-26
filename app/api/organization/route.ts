import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  legal_name: z.string().min(1).max(160).optional(),
  siret: z.string().max(40).nullable().optional(),
  vat_number: z.string().max(40).nullable().optional(),
  address: z.object({
    line1: z.string().max(160).optional(),
    line2: z.string().max(160).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(80).optional(),
  }).optional(),
  contact: z.object({
    phone: z.string().max(40).optional(),
    email: z.string().email().max(160).optional(),
    website: z.string().max(200).optional(),
  }).optional(),
});

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT name, legal_name, siret, vat_number, address, contact
       FROM organizations WHERE id = $1`,
    [g.user.organizationId],
  );
  return NextResponse.json({ organization: rows[0] });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.name !== undefined)       { sets.push(`name = $${i++}`);       vals.push(d.name); }
  if (d.legal_name !== undefined) { sets.push(`legal_name = $${i++}`); vals.push(d.legal_name); }
  if (d.siret !== undefined)      { sets.push(`siret = $${i++}`);      vals.push(d.siret); }
  if (d.vat_number !== undefined) { sets.push(`vat_number = $${i++}`); vals.push(d.vat_number); }
  if (d.address !== undefined)    { sets.push(`address = $${i++}`);    vals.push(JSON.stringify(d.address)); }
  if (d.contact !== undefined)    { sets.push(`contact = $${i++}`);    vals.push(JSON.stringify(d.contact)); }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  vals.push(g.user.organizationId);

  await query(
    `UPDATE organizations SET ${sets.join(', ')} WHERE id = $${i}`,
    vals,
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'organization.update',
    entityType: 'organization',
    entityId: g.user.organizationId,
    payload: d,
  });

  return NextResponse.json({ ok: true });
}
