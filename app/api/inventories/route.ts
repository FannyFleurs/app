import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  label: z.string().min(1).max(200),
  store_id: z.string().uuid(),
  scope_type: z.enum(['total', 'category', 'supplier']),
  // scope_ids : ids de categorie OU references fournisseur (texte). Vide pour total.
  scope_ids: z.array(z.string().max(200)).default([]),
});

/**
 * Liste des inventaires (recents en premier).
 */
export async function GET() {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const r = await query<{
    id: string; label: string; store_id: string; store_name: string;
    scope_type: string; scope_ids: string[]; status: string;
    created_at: string; finalized_at: string | null;
    line_count: number; delta_count: number;
  }>(
    `SELECT i.id, i.label, i.store_id, s.name AS store_name,
            i.scope_type, i.scope_ids, i.status,
            i.created_at, i.finalized_at,
            COALESCE(l.line_count, 0) AS line_count,
            COALESCE(l.delta_count, 0) AS delta_count
       FROM inventories i
       LEFT JOIN stores s ON s.id = i.store_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS line_count,
                COUNT(*) FILTER (WHERE counted_qty <> expected_qty)::int AS delta_count
           FROM inventory_lines il WHERE il.inventory_id = i.id
       ) l ON TRUE
      WHERE i.organization_id = $1
      ORDER BY i.created_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );
  return NextResponse.json({ inventories: r.rows });
}

/**
 * Cree une session d'inventaire + pre-remplit les lignes attendues a
 * partir des stock_levels de la boutique cible, filtre selon scope_type.
 */
export async function POST(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  if (d.scope_type !== 'total' && d.scope_ids.length === 0) {
    return jsonError('SCOPE_IDS_REQUIRED', 400);
  }

  try {
    const result = await withTransaction(async (client) => {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO inventories
           (organization_id, store_id, label, scope_type, scope_ids, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          g.user.organizationId, d.store_id, d.label,
          d.scope_type, d.scope_ids, g.user.id,
        ],
      );
      const inventoryId = ins.rows[0]!.id;

      // Pre-remplit les lignes attendues.
      //   expected_qty <- stock_levels.quantity de la boutique
      //   purchase_price_ht <- snapshot pour la valorisation ulterieure
      const whereScope =
        d.scope_type === 'total' ? '' :
        d.scope_type === 'category' ? `AND p.category_id = ANY($4::uuid[])` :
        `AND p.supplier_ref = ANY($4::text[])`;

      const args: unknown[] = [g.user.organizationId, d.store_id, inventoryId];
      if (d.scope_type !== 'total') args.push(d.scope_ids);

      await client.query(
        `INSERT INTO inventory_lines
           (inventory_id, product_id, expected_qty, counted_qty, purchase_price_ht)
         SELECT $3, p.id,
                COALESCE(sl.quantity, 0), 0, p.purchase_price_ht
           FROM products p
           LEFT JOIN stock_levels sl
             ON sl.product_id = p.id AND sl.store_id = $2 AND sl.organization_id = $1
          WHERE p.organization_id = $1
            AND p.is_active = TRUE
            ${whereScope}`,
        args,
      );

      return { id: inventoryId };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'inventory.create',
      entityType: 'inventory', entityId: result.id,
      payload: { label: d.label, scope_type: d.scope_type },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[inventory.create]', err);
    return jsonError('INTERNAL_ERROR', 500, { message: (err as Error).message });
  }
}
