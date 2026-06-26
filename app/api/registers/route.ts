import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  store_id: z.string().uuid(),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
});

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT r.id, r.code, r.name, r.store_id, r.is_active,
            s.name AS store_name
       FROM registers r
       JOIN stores s ON s.id = r.store_id
      WHERE r.organization_id = $1
      ORDER BY s.name, r.name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ registers: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const ins = await query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
      [g.user.organizationId, d.store_id, d.code, d.name],
    );
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'registers.create', entityType: 'register', entityId: ins.rows[0]!.id,
      payload: d,
    });
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (m.includes('duplicate')) return jsonError('CODE_ALREADY_EXISTS', 409);
    console.error('[registers.create]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: m }, { status: 500 });
  }
}
