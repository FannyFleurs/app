import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * Libère une caisse à distance (super-admin) : coupe la liaison poste.
 * Le poste devra re-choisir sa caisse au prochain accès. Vérifie que la
 * caisse appartient bien à l'organisation ciblée.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; rid: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const cur = await query<{ device_id: string | null; device_name: string | null }>(
    `SELECT device_id, device_name FROM registers
      WHERE id = $1 AND organization_id = $2`,
    [params.rid, params.id],
  );
  if (cur.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const prev = cur.rows[0]!;

  await query(
    `UPDATE registers
        SET device_id = NULL, device_name = NULL, bound_at = NULL
      WHERE id = $1 AND organization_id = $2`,
    [params.rid, params.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'admin.register.release',
    entityType: 'register', entityId: params.rid,
    payload: { target_org: params.id, previous_device: prev.device_name ?? prev.device_id },
  });

  return NextResponse.json({ ok: true });
}
