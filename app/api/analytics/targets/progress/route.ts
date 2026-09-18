import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { hasTargetsTable, monthBounds } from '@/lib/analytics/targets-server';

export const dynamic = 'force-dynamic';

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  store_id: z.string().uuid().optional().nullable(),
});

/**
 * Avancement des objectifs de CA d'un mois : par boutique, l'objectif et le
 * réalisé (CA TTC des ventes validées du mois), le taux d'atteinte et une
 * projection de fin de mois au rythme actuel (mois en cours uniquement).
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    year: url.searchParams.get('year'),
    month: url.searchParams.get('month'),
    store_id: url.searchParams.get('store_id') || undefined,
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { year, month, store_id } = parsed.data;
  const { start, end, daysInMonth } = monthBounds(year, month);

  const storeFilter = store_id ? 'AND s.store_id = $4' : '';
  const actualArgs: unknown[] = store_id
    ? [g.user.organizationId, start, end, store_id]
    : [g.user.organizationId, start, end];

  // Réalisé (CA TTC) par boutique sur le mois.
  const actualRes = await query<{ store_id: string; ttc: string }>(
    `SELECT s.store_id, COALESCE(SUM(s.total_ttc), 0)::text AS ttc
       FROM sales s
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeFilter}
      GROUP BY s.store_id`,
    actualArgs,
  );
  const actualByStore = new Map(actualRes.rows.map((r) => [r.store_id, Number(r.ttc)]));

  // Objectifs par boutique (si la table existe).
  const targetByStore = new Map<string, number>();
  if (await hasTargetsTable()) {
    const tRes = await query<{ store_id: string; target_ttc: string }>(
      `SELECT store_id, target_ttc::text FROM revenue_targets
        WHERE organization_id = $1 AND year = $2 AND month = $3
          ${store_id ? 'AND store_id = $4' : ''}`,
      store_id ? [g.user.organizationId, year, month, store_id] : [g.user.organizationId, year, month],
    );
    for (const r of tRes.rows) targetByStore.set(r.store_id, Number(r.target_ttc));
  }

  // Boutiques actives (périmètre).
  const storesRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE ${store_id ? 'AND id = $2' : ''}
      ORDER BY name`,
    store_id ? [g.user.organizationId, store_id] : [g.user.organizationId],
  );

  // Rythme : jours écoulés du mois. Mois passé = complet ; futur = 0 ; en cours
  // = quantième du jour.
  const now = new Date();
  const curY = now.getFullYear(), curM = now.getMonth() + 1;
  const isCurrent = year === curY && month === curM;
  const isPast = year < curY || (year === curY && month < curM);
  const daysElapsed = isCurrent ? now.getDate() : isPast ? daysInMonth : 0;

  const pct = (actual: number, target: number) => (target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0);
  const project = (actual: number) => (isCurrent && daysElapsed > 0
    ? Number(((actual / daysElapsed) * daysInMonth).toFixed(2)) : null);

  const stores = storesRes.rows.map((st) => {
    const actual = actualByStore.get(st.id) ?? 0;
    const target = targetByStore.get(st.id) ?? 0;
    return {
      store_id: st.id, store: st.name, target, actual,
      pct: pct(actual, target), projection: project(actual),
    };
  });

  const totalTarget = stores.reduce((a, s) => a + s.target, 0);
  const totalActual = stores.reduce((a, s) => a + s.actual, 0);

  return NextResponse.json({
    year, month,
    days_in_month: daysInMonth, days_elapsed: daysElapsed, is_current_month: isCurrent,
    stores,
    total: {
      target: Number(totalTarget.toFixed(2)),
      actual: Number(totalActual.toFixed(2)),
      pct: pct(totalActual, totalTarget),
      projection: project(totalActual),
    },
  });
}
