import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

/**
 * Renvoie l'info de clôture pour une date donnée (toutes boutiques cumulées).
 * Pratique pour afficher un indicateur "journée fermée" dans Ma journée
 * sans charger toute la preview.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  if (!date) return NextResponse.json({ sealed_at: null });

  const { rows } = await query<{ sealed_at: string }>(
    `SELECT MAX(sealed_at) AS sealed_at
       FROM daily_closures
      WHERE organization_id = $1 AND business_date = $2::date`,
    [g.user.organizationId, date],
  );
  return NextResponse.json({ sealed_at: rows[0]?.sealed_at ?? null });
}
