import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { monthBreakdown } from '@/lib/analytics/objectives';
import { loadSchedules, scheduleFor } from '@/lib/analytics/objectives-server';
import { hasTargetsTable, monthBounds } from '@/lib/analytics/targets-server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  store_id: z.string().uuid().optional().nullable(),
});

/** Date du jour en fuseau Paris (aaaa-mm-jj). */
function todayParis(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}

/**
 * Cockpit des objectifs : pour une boutique, un mois donné, la répartition
 * journalière de l'objectif (semaine-type pondérée), le réalisé par jour, les
 * agrégats (théorique à date, avance/retard, projection, taux d'atteinte) et la
 * série des 12 mois (réel vs objectif).
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const org = g.user.organizationId;

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    year: url.searchParams.get('year'),
    month: url.searchParams.get('month'),
    store_id: url.searchParams.get('store_id') || undefined,
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { year, month } = parsed.data;

  const storesRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [org],
  );
  if (storesRes.rows.length === 0) return jsonError('NO_STORE', 404);
  const storeId = parsed.data.store_id && storesRes.rows.some((s) => s.id === parsed.data.store_id)
    ? parsed.data.store_id
    : storesRes.rows[0]!.id;

  const hasTable = await hasTargetsTable();
  const schedules = await loadSchedules(org);
  const weights = scheduleFor(schedules, storeId);

  // Objectif du mois.
  let objectiveMonth = 0;
  if (hasTable) {
    const t = await query<{ target_ttc: string }>(
      `SELECT target_ttc::text FROM revenue_targets
        WHERE organization_id = $1 AND store_id = $2 AND year = $3 AND month = $4`,
      [org, storeId, year, month],
    );
    objectiveMonth = Number(t.rows[0]?.target_ttc ?? 0);
  }

  // Réalisé par jour du mois (CA TTC + nb tickets).
  const { start, end } = monthBounds(year, month);
  const dayRes = await query<{ d: string; ttc: string; n: number }>(
    `SELECT (s.validated_at AT TIME ZONE 'Europe/Paris')::date::text AS d,
            COALESCE(SUM(s.total_ttc), 0)::text AS ttc, COUNT(*)::int AS n
       FROM sales s
      WHERE s.organization_id = $1 AND s.store_id = $2 AND s.status = 'validated'
        AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $3::date AND $4::date
      GROUP BY 1`,
    [org, storeId, start, end],
  );
  const realized: Record<string, { ca: number; tickets: number }> = {};
  for (const r of dayRes.rows) realized[r.d] = { ca: Number(r.ttc), tickets: Number(r.n) };

  const breakdown = monthBreakdown({ year, month, objectiveMonth, weights, todayIso: todayParis(), realized });

  // Série 12 mois de l'année : objectif + réalisé par mois.
  const yObjRows = hasTable
    ? (await query<{ month: number; target_ttc: string }>(
        `SELECT month, target_ttc::text FROM revenue_targets
          WHERE organization_id = $1 AND store_id = $2 AND year = $3`,
        [org, storeId, year],
      )).rows
    : [];
  const yRealRows = (await query<{ m: number; ttc: string }>(
    `SELECT EXTRACT(MONTH FROM (s.validated_at AT TIME ZONE 'Europe/Paris'))::int AS m,
            COALESCE(SUM(s.total_ttc), 0)::text AS ttc
       FROM sales s
      WHERE s.organization_id = $1 AND s.store_id = $2 AND s.status = 'validated'
        AND EXTRACT(YEAR FROM (s.validated_at AT TIME ZONE 'Europe/Paris'))::int = $3
      GROUP BY 1`,
    [org, storeId, year],
  )).rows;
  const objByMonth = new Map(yObjRows.map((r) => [Number(r.month), Number(r.target_ttc)]));
  const realByMonth = new Map(yRealRows.map((r) => [Number(r.m), Number(r.ttc)]));
  const yearSeries = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    objective: objByMonth.get(i + 1) ?? 0,
    realized: realByMonth.get(i + 1) ?? 0,
  }));
  const yearObjective = yearSeries.reduce((a, m) => a + m.objective, 0);
  const yearRealized = yearSeries.reduce((a, m) => a + m.realized, 0);

  return NextResponse.json({
    store_id: storeId,
    stores: storesRes.rows.map((s) => ({ store_id: s.id, store: s.name })),
    weights,
    ...breakdown,
    yearSeries,
    yearObjective: Number(yearObjective.toFixed(2)),
    yearRealized: Number(yearRealized.toFixed(2)),
  });
}
