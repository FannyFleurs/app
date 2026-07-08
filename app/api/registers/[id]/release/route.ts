import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

/**
 * POST /api/registers/[id]/release
 * Libere une caisse : coupe le lien avec le poste actuel. Admin/manager
 * uniquement (permission settings.write). Cas typique : le tablette
 * a change, l'admin libere pour qu'un nouvel appareil puisse binder.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;

  const cur = await query<{ device_id: string | null; device_name: string | null }>(
    `SELECT device_id, device_name FROM registers
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cur.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const previous = cur.rows[0]!;

  await query(
    `UPDATE registers
        SET device_id = NULL, device_name = NULL, bound_at = NULL
      WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'registers.release', entityType: 'register', entityId: params.id,
    payload: { previous_device_id: previous.device_id, previous_device_name: previous.device_name },
  });
  return NextResponse.json({ ok: true });
}
