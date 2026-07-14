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
 * Retours & annulations de la période pour l'espace CA (suivi à distance) :
 * nombre d'avoirs émis, montant total, nombre de ventes entièrement annulées,
 * et le détail (motif, ticket d'origine, boutique, heure).
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

  try {
    // Agrégats exacts (sans LIMIT).
    const agg = await query<{ count: number; total: string; cancelled: number }>(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(cn.amount), 0)::text AS total,
              COUNT(*) FILTER (WHERE s.status = 'cancelled_by_credit_note')::int AS cancelled
         FROM credit_notes cn
         LEFT JOIN sales s ON s.id = cn.sale_id
        WHERE cn.organization_id = $1
          AND cn.status <> 'cancelled'
          AND cn.created_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}`,
      args,
    );

    // Détail : motif, ticket d'origine, boutique, heure (50 plus récents).
    const items = await query<{
      id: string; number: string; amount: string; reason: string;
      created_at: string; receipt_number: string | null;
      sale_status: string | null; store_name: string | null;
    }>(
      `SELECT cn.id, cn.number, cn.amount::text, cn.reason, cn.created_at,
              s.receipt_number, s.status AS sale_status, st.name AS store_name
         FROM credit_notes cn
         LEFT JOIN sales s ON s.id = cn.sale_id
         LEFT JOIN stores st ON st.id = s.store_id
        WHERE cn.organization_id = $1
          AND cn.status <> 'cancelled'
          AND cn.created_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        ORDER BY cn.created_at DESC
        LIMIT 50`,
      args,
    );

    const a = agg.rows[0]!;
    return NextResponse.json({
      count: a.count,
      cancelled_sales: a.cancelled,
      total: Number(a.total),
      items: items.rows,
    });
  } catch {
    // Table absente (migration non appliquée) : réponse vide plutôt qu'un 500.
    return NextResponse.json({ count: 0, cancelled_sales: 0, total: 0, items: [] });
  }
}
