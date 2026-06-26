import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  address: z.object({
    line1: z.string().max(160).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(80).optional(),
  }).optional(),
});

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT id, code, name, address, is_active
       FROM stores WHERE organization_id = $1
       ORDER BY name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ stores: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const ins = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name, address, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [g.user.organizationId, d.code, d.name, JSON.stringify(d.address ?? {})],
    );
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stores.create', entityType: 'store', entityId: ins.rows[0]!.id,
      payload: d,
    });
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('duplicate')) return jsonError('CODE_ALREADY_EXISTS', 409);
    // eslint-disable-next-line no-console
    console.error('[stores.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
