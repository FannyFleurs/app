import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Réceptions envoyées au PDA (« Nouvelle réception ») pour LA boutique du
 * poste, avec au moins un article restant à réceptionner. Une réception
 * dont store_ids est vide cible toutes les boutiques ; sinon, seulement
 * celles listées — même convention que products.store_ids.
 */
export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id');
  if (!storeId) return jsonError('STORE_ID_REQUIRED', 400);

  const { rows } = await query<{
    id: string; filename: string | null; created_at: string;
    total: string; received: string;
  }>(
    `SELECT r.id, r.filename, r.created_at::text,
            COUNT(ri.id)::text AS total,
            COUNT(ri.id) FILTER (WHERE ri.received_qty IS NOT NULL)::text AS received
       FROM receptions r
       JOIN reception_items ri ON ri.reception_id = r.id
      WHERE r.organization_id = $1
        AND r.sent_to_pda = TRUE
        AND (COALESCE(array_length(r.store_ids, 1), 0) = 0 OR r.store_ids @> ARRAY[$2]::uuid[])
      GROUP BY r.id
     HAVING COUNT(ri.id) FILTER (WHERE ri.received_qty IS NULL) > 0
      ORDER BY r.created_at DESC
      LIMIT 50`,
    [g.user.organizationId, storeId],
  );

  return NextResponse.json({
    receptions: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      created_at: r.created_at,
      total: Number(r.total),
      received: Number(r.received),
    })),
  });
}
