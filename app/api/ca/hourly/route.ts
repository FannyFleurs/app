import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * CA HT par heure de la journee. Retourne 24 buckets (0h -> 23h)
 * mais on ne renvoie que les heures avec au moins un ticket.
 * Utilise pour tracer le graphique CA par heure du dashboard.
 */
export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    store_id: url.searchParams.get('store_id') || undefined,
    from: url.searchParams.get('from'),
    to:   url.searchParams.get('to'),
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { store_id, from, to } = parsed.data;

  const storeFilter = store_id ? 'AND s.store_id = $4' : '';
  const args: unknown[] = [g.user.organizationId, from, to];
  if (store_id) args.push(store_id);

  const r = await query<{ hour: number; ca_ht: string; ca_ttc: string; tickets_count: number }>(
    `SELECT EXTRACT(HOUR FROM s.validated_at)::int AS hour,
            SUM(s.total_ht)::text  AS ca_ht,
            SUM(s.total_ttc)::text AS ca_ttc,
            COUNT(*)::int          AS tickets_count
       FROM sales s
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY hour
      ORDER BY hour`,
    args,
  );

  return NextResponse.json({
    hours: r.rows.map((h) => ({
      hour: h.hour,
      ca_ht: Number(h.ca_ht),
      ca_ttc: Number(h.ca_ttc),
      tickets_count: h.tickets_count,
    })),
  });
}
