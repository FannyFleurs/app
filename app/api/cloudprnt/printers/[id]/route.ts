import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { storeInOrg } from '@/lib/auth/stores-server';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  store_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  poll_token: z.string().max(120).nullable().optional(),
  poll_interval: z.number().int().min(1).max(60).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;
  if (d.store_id && !(await storeInOrg(d.store_id, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 400 });
  }
  const sets: string[] = [];
  const vals: unknown[] = [params.id, g.user.organizationId];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (d.label !== undefined) add('label', d.label.trim());
  if (d.store_id !== undefined) add('store_id', d.store_id);
  if (d.enabled !== undefined) add('enabled', d.enabled);
  if (d.poll_token !== undefined) add('poll_token', d.poll_token?.trim() || null);
  if (d.poll_interval !== undefined) add('poll_interval', d.poll_interval);
  if (sets.length === 0) return NextResponse.json({ ok: true });
  const { rowCount } = await query(
    `UPDATE cloudprnt_printers SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    vals,
  );
  if (rowCount === 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const { rowCount } = await query(
    `DELETE FROM cloudprnt_printers WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (rowCount === 0) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
