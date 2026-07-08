import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  device_id: z.string().min(8).max(80),
  device_name: z.string().min(1).max(80).optional(),
});

/**
 * POST /api/registers/[id]/bind
 * Lie l'appareil courant (identifie par un UUID cote client, stocke en
 * localStorage) a une caisse. Regle "un poste = une caisse" :
 *   - Si la caisse est deja liee a un autre appareil -> 409.
 *   - Si l'appareil est deja lie a une caisse -> on migre le lien
 *     (relache l'ancienne caisse). Cela evite les cas ou l'utilisateur
 *     re-choisit une caisse volontairement apres qu'un admin a libere
 *     une caisse.
 * Permission : pos.use (n'importe quel vendeur peut lier son poste).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { device_id, device_name } = parsed.data;

  // 1) la caisse existe dans l'org
  const target = await query<{
    id: string; device_id: string | null; device_name: string | null; name: string;
  }>(
    `SELECT id, device_id, device_name, name FROM registers
      WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
    [params.id, g.user.organizationId],
  );
  if (target.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const tgt = target.rows[0]!;

  // 2) deja lie a cet appareil : idempotent, on met a jour le nom au passage
  if (tgt.device_id === device_id) {
    if (device_name && device_name !== tgt.device_name) {
      await query(
        `UPDATE registers SET device_name = $1 WHERE id = $2`,
        [device_name, params.id],
      );
    }
    return NextResponse.json({ ok: true, already_bound: true });
  }

  // 3) la caisse est prise par un autre appareil : blocage
  if (tgt.device_id && tgt.device_id !== device_id) {
    return NextResponse.json(
      {
        error: 'ALREADY_BOUND',
        device_name: tgt.device_name,
      },
      { status: 409 },
    );
  }

  // 4) l'appareil est peut-etre deja lie a une AUTRE caisse : on libere
  //    (l'utilisateur change de caisse volontairement).
  await query(
    `UPDATE registers
        SET device_id = NULL, device_name = NULL, bound_at = NULL
      WHERE organization_id = $1 AND device_id = $2 AND id <> $3`,
    [g.user.organizationId, device_id, params.id],
  );

  // 5) bind
  const upd = await query(
    `UPDATE registers
        SET device_id = $1, device_name = $2, bound_at = NOW()
      WHERE id = $3 AND organization_id = $4
        AND (device_id IS NULL OR device_id = $1)`,
    [device_id, device_name ?? null, params.id, g.user.organizationId],
  );
  if (upd.rowCount === 0) {
    // Race condition : quelqu'un a bind entre nos deux checks
    return jsonError('ALREADY_BOUND', 409);
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'registers.bind', entityType: 'register', entityId: params.id,
    payload: { device_id, device_name: device_name ?? null },
  });
  return NextResponse.json({ ok: true, register_name: tgt.name });
}
