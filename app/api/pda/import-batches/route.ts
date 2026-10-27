import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Imports envoyés au PDA (« Réception d'import ») pour LA boutique du poste,
 * avec au moins un article restant à réceptionner. Un import dont
 * store_ids est vide cible toutes les boutiques ; sinon, seulement celles
 * listées — même convention que products.store_ids.
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
    `SELECT ib.id, ib.filename, ib.created_at::text,
            COUNT(ibi.id)::text AS total,
            COUNT(ibi.id) FILTER (WHERE ibi.received_qty IS NOT NULL)::text AS received
       FROM import_batches ib
       JOIN import_batch_items ibi ON ibi.import_batch_id = ib.id
      WHERE ib.organization_id = $1
        AND ib.sent_to_pda = TRUE
        AND (COALESCE(array_length(ib.store_ids, 1), 0) = 0 OR ib.store_ids @> ARRAY[$2]::uuid[])
      GROUP BY ib.id
     HAVING COUNT(ibi.id) FILTER (WHERE ibi.received_qty IS NULL) > 0
      ORDER BY ib.created_at DESC
      LIMIT 50`,
    [g.user.organizationId, storeId],
  );

  return NextResponse.json({
    batches: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      created_at: r.created_at,
      total: Number(r.total),
      received: Number(r.received),
    })),
  });
}
