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
 * Repartition du CA par taux de TVA, calcule directement sur les
 * sale_lines validees.
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

  const r = await query<{
    tax_rate: string; base_ht: string; tva: string; ttc: string;
  }>(
    `SELECT sl.tax_rate::text,
            SUM(sl.line_ht)::text  AS base_ht,
            SUM(sl.line_tva)::text AS tva,
            SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      GROUP BY sl.tax_rate
      ORDER BY sl.tax_rate DESC`,
    args,
  );

  return NextResponse.json({
    tva: r.rows.map((t) => ({
      rate: Number(t.tax_rate),
      base_ht: Number(t.base_ht),
      tva: Number(t.tva),
      ttc: Number(t.ttc),
    })),
  });
}
