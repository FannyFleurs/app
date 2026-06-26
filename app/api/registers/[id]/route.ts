import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const patch = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120).optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patch);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (d.code !== undefined)      { sets.push(`code = $${i++}`); vals.push(d.code); }
  if (d.name !== undefined)      { sets.push(`name = $${i++}`); vals.push(d.name); }
  if (d.is_active !== undefined) { sets.push(`is_active = $${i++}`); vals.push(d.is_active); }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  vals.push(params.id, g.user.organizationId);

  const r = await query(
    `UPDATE registers SET ${sets.join(', ')}
      WHERE id = $${i++} AND organization_id = $${i}`,
    vals,
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'registers.update', entityType: 'register', entityId: params.id,
    payload: d,
  });
  return NextResponse.json({ ok: true });
}
