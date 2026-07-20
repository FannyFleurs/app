import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission, requireSession } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/label-stations
 * Liste des PDA (stations d'impression) rattachés, groupables par boutique.
 * Back-office : paramétrage des PDA par boutique.
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const { rows } = await query<{
    id: string; store_id: string; store_name: string; device_id: string;
    name: string; last_seen_at: string | null; created_at: string;
  }>(
    `SELECT ls.id, ls.store_id, s.name AS store_name, ls.device_id, ls.name,
            ls.last_seen_at, ls.created_at
       FROM label_stations ls
       JOIN stores s ON s.id = ls.store_id
      WHERE ls.organization_id = $1
      ORDER BY s.name, ls.name`,
    [g.user.organizationId],
  );
  return NextResponse.json({ stations: rows });
}

const bindSchema = z.object({
  device_id: z.string().min(8).max(80),
  store_id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
});

/**
 * POST /api/label-stations
 * Rattache l'appareil courant (device_id, localStorage) à une boutique.
 * Un appareil = une boutique : re-poster migre le rattachement.
 * Accessible à tout utilisateur connecté, mais uniquement vers une boutique
 * à laquelle il a accès.
 */
export async function POST(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, bindSchema);
  if ('response' in parsed) return parsed.response;
  const { device_id, store_id, name } = parsed.data;

  // La boutique doit appartenir à l'org ET être accessible à l'utilisateur.
  const privileged = ['super_admin', 'owner', 'manager'].includes(g.user.role);
  const store = await query<{ id: string; name: string }>(
    `SELECT s.id, s.name FROM stores s
      WHERE s.id = $1 AND s.organization_id = $2 AND s.is_active = TRUE
        AND (
          $3
          OR NOT EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $4)
          OR EXISTS (SELECT 1 FROM user_store_access WHERE user_id = $4 AND store_id = s.id)
        )`,
    [store_id, g.user.organizationId, privileged, g.user.id],
  );
  if (store.rowCount === 0) return jsonError('STORE_NOT_ACCESSIBLE', 403);

  const stationName = name?.trim() || `PDA ${store.rows[0]!.name}`;
  const up = await query<{ id: string }>(
    `INSERT INTO label_stations (organization_id, store_id, device_id, name, last_seen_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (organization_id, device_id)
     DO UPDATE SET store_id = EXCLUDED.store_id, name = EXCLUDED.name, last_seen_at = now()
     RETURNING id`,
    [g.user.organizationId, store_id, device_id, stationName],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'label_station.bind', entityType: 'label_station', entityId: up.rows[0]!.id,
    payload: { store_id, name: stationName },
  });

  return NextResponse.json({ ok: true, id: up.rows[0]!.id, store_name: store.rows[0]!.name });
}
