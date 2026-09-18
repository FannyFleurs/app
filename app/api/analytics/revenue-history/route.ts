import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Couverture de l'historique de CA importé, par boutique : nombre de jours
 * renseignés, première et dernière date, CA TTC cumulé. Alimente l'écran de
 * réglage (aperçu de ce qui est déjà en base).
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    store_id: string; store: string; days: string;
    first_day: string | null; last_day: string | null; ca_ttc: string;
  }>(
    `SELECT st.id AS store_id, st.name AS store,
            COUNT(rh.*)::text AS days,
            MIN(rh.day)::text AS first_day,
            MAX(rh.day)::text AS last_day,
            COALESCE(SUM(rh.ca_ttc), 0)::text AS ca_ttc
       FROM stores st
       LEFT JOIN revenue_history rh
              ON rh.store_id = st.id AND rh.organization_id = $1
      WHERE st.organization_id = $1 AND st.is_active = TRUE
      GROUP BY st.id, st.name
      ORDER BY st.name`,
    [g.user.organizationId],
  );

  return NextResponse.json({
    stores: rows.map((r) => ({
      store_id: r.store_id,
      store: r.store,
      days: Number(r.days),
      first_day: r.first_day,
      last_day: r.last_day,
      ca_ttc: Number(r.ca_ttc),
    })),
  });
}
