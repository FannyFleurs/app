import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * GET /api/label-stations/mine?device_id=...
 * Renvoie la station (PDA) liée à CET appareil : sa boutique de rattachement,
 * pour ne montrer que les articles de cette boutique.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const deviceId = new URL(req.url).searchParams.get('device_id');
  if (!deviceId) return NextResponse.json({ station: null });

  try {
    const { rows } = await query<{
      id: string; store_id: string; store_name: string; name: string;
    }>(
      `SELECT ls.id, ls.store_id, s.name AS store_name, ls.name
         FROM label_stations ls
         JOIN stores s ON s.id = ls.store_id
        WHERE ls.organization_id = $1 AND ls.device_id = $2
        LIMIT 1`,
      [g.user.organizationId, deviceId],
    );
    // Mise à jour discrète du "vu récemment".
    if (rows[0]) {
      void query(`UPDATE label_stations SET last_seen_at = now() WHERE id = $1`, [rows[0].id]);
    }
    return NextResponse.json({ station: rows[0] ?? null });
  } catch {
    return NextResponse.json({ station: null });
  }
}
