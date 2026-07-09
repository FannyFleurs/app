import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * GET /api/registers/mine?device_id=...
 * Renvoie la caisse liée à CET appareil (device_id en localStorage),
 * pour afficher la référence du poste dans l'interface.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const deviceId = new URL(req.url).searchParams.get('device_id');
  if (!deviceId) return NextResponse.json({ register: null });

  try {
    const { rows } = await query<{
      id: string; code: string; name: string; store_name: string;
    }>(
      `SELECT r.id, r.code, r.name, s.name AS store_name
         FROM registers r
         JOIN stores s ON s.id = r.store_id
        WHERE r.organization_id = $1 AND r.device_id = $2
        LIMIT 1`,
      [g.user.organizationId, deviceId],
    );
    return NextResponse.json({ register: rows[0] ?? null });
  } catch {
    return NextResponse.json({ register: null });
  }
}
