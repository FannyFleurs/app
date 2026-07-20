import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  store_id: z.string().uuid().optional(),
});

/** PATCH /api/label-stations/[id] — renommer ou réaffecter un PDA (BO). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const { name, store_id } = parsed.data;

  if (store_id) {
    const ok = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [store_id, g.user.organizationId],
    );
    if (ok.rowCount === 0) return jsonError('INVALID_STORE', 400);
  }

  const res = await query(
    `UPDATE label_stations
        SET name = COALESCE($3, name), store_id = COALESCE($4, store_id)
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId, name ?? null, store_id ?? null],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/label-stations/[id] — dissocier un PDA (BO). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const res = await query(
    `DELETE FROM label_stations WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'label_station.delete', entityType: 'label_station', entityId: params.id,
  });
  return NextResponse.json({ ok: true });
}
