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
 * Liste des tickets valides pour la periode donnee (organisation +
 * boutique optionnelle). Utilise par l'onglet Tickets du dashboard CA.
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
    id: string; receipt_number: string; validated_at: string;
    total_ttc: string; user_full_name: string; customer_name: string | null;
    account_created_at_sale: boolean;
  }>(
    `SELECT s.id, s.receipt_number, s.validated_at,
            s.total_ttc::text,
            u.full_name AS user_full_name,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer_name,
            (c.id IS NOT NULL AND c.created_at >= s.created_at) AS account_created_at_sale
       FROM sales s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        ${storeFilter}
      ORDER BY s.validated_at DESC
      LIMIT 200`,
    args,
  );

  return NextResponse.json({ tickets: r.rows });
}
