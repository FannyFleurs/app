import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const schema = z.object({
  product_id: z.string().uuid(),
  from_store_id: z.string().uuid(),
  to_store_id: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.string().max(200).optional().nullable(),
}).refine(
  (d) => d.from_store_id !== d.to_store_id,
  { message: 'Boutique source et destination identiques' },
);

/**
 * Transfert de stock entre 2 boutiques d'une meme organisation.
 *
 * - Debite `quantity` du stock_levels de from_store_id (transfer_out)
 * - Credite `quantity` du stock_levels de to_store_id (transfer_in)
 * - Si le produit n'a pas de portee (store_ids vide), pas de modif — il
 *   est deja visible dans les 2 boutiques
 * - Si le produit a une portee restreinte qui ne contient pas la
 *   boutique destination, on l'y ajoute automatiquement (le produit
 *   apparait immediatement dans le catalogue caisse de la destination)
 * - Les mouvements portent le meme source_id pour traçabilite du couple
 */
export async function POST(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      // Verifie que les 2 boutiques appartiennent bien a l'org.
      const stores = await client.query<{ id: string }>(
        `SELECT id FROM stores
          WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
        [g.user.organizationId, [d.from_store_id, d.to_store_id]],
      );
      if (stores.rowCount !== 2) throw new Error('STORE_NOT_FOUND');

      // Charge le produit + son store_ids.
      const prod = await client.query<{
        id: string; name: string; store_ids: string[];
      }>(
        `SELECT id, name, COALESCE(store_ids, '{}') AS store_ids
           FROM products
          WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
          FOR UPDATE`,
        [d.product_id, g.user.organizationId],
      );
      if (prod.rowCount === 0) throw new Error('PRODUCT_NOT_FOUND');
      const p = prod.rows[0]!;

      // Si le produit a une portee restreinte qui exclut la destination,
      // on ajoute la destination pour que le produit apparaisse dans la
      // caisse cible.
      const currentScope = p.store_ids ?? [];
      if (currentScope.length > 0 && !currentScope.includes(d.to_store_id)) {
        await client.query(
          `UPDATE products
              SET store_ids = array_append(store_ids, $1),
                  updated_at = now(),
                  updated_by = $3
            WHERE id = $2`,
          [d.to_store_id, d.product_id, g.user.id],
        );
      }

      // Debite le stock source. FOR UPDATE protege contre les doubles-clics.
      const src = await client.query<{ id: string; quantity: string }>(
        `SELECT id, quantity::text FROM stock_levels
          WHERE product_id = $1 AND store_id = $2 AND organization_id = $3
          FOR UPDATE`,
        [d.product_id, d.from_store_id, g.user.organizationId],
      );
      const srcQty = src.rows[0] ? Number(src.rows[0].quantity) : 0;
      if (srcQty < d.quantity) throw new Error('INSUFFICIENT_STOCK');
      const newSrcQty = Number((srcQty - d.quantity).toFixed(3));

      if (src.rowCount === 0) {
        // Cas edge : pas de ligne stock a la source → refuse
        throw new Error('INSUFFICIENT_STOCK');
      }
      await client.query(
        `UPDATE stock_levels
            SET quantity = $1, updated_at = now()
          WHERE id = $2`,
        [newSrcQty, src.rows[0]!.id],
      );

      // Credite le stock destination (INSERT si absent).
      const dst = await client.query<{ id: string; quantity: string }>(
        `SELECT id, quantity::text FROM stock_levels
          WHERE product_id = $1 AND store_id = $2 AND organization_id = $3
          FOR UPDATE`,
        [d.product_id, d.to_store_id, g.user.organizationId],
      );
      const dstQty = dst.rows[0] ? Number(dst.rows[0].quantity) : 0;
      const newDstQty = Number((dstQty + d.quantity).toFixed(3));
      if (dst.rowCount === 0) {
        await client.query(
          `INSERT INTO stock_levels
             (organization_id, store_id, product_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [g.user.organizationId, d.to_store_id, d.product_id, newDstQty],
        );
      } else {
        await client.query(
          `UPDATE stock_levels
              SET quantity = $1, updated_at = now()
            WHERE id = $2`,
          [newDstQty, dst.rows[0]!.id],
        );
      }

      // Ecrit les 2 mouvements. On chaine les 2 par source_id pour la
      // tracabilite de la paire (out et in). On genere un UUID commun via
      // le mouvement OUT et on le passe comme source_id du IN.
      const outMov = await client.query<{ id: string }>(
        `INSERT INTO stock_movements
           (organization_id, store_id, product_id, movement_type,
            quantity_delta, previous_quantity, new_quantity,
            reason, source_type, user_id)
         VALUES ($1,$2,$3,'transfer_out',$4,$5,$6,$7,'transfer',$8)
         RETURNING id`,
        [
          g.user.organizationId, d.from_store_id, d.product_id,
          -d.quantity, srcQty, newSrcQty,
          d.reason ?? `Transfert vers boutique`, g.user.id,
        ],
      );
      await client.query(
        `INSERT INTO stock_movements
           (organization_id, store_id, product_id, movement_type,
            quantity_delta, previous_quantity, new_quantity,
            reason, source_type, source_id, user_id)
         VALUES ($1,$2,$3,'transfer_in',$4,$5,$6,$7,'transfer',$8,$9)`,
        [
          g.user.organizationId, d.to_store_id, d.product_id,
          d.quantity, dstQty, newDstQty,
          d.reason ?? `Transfert depuis boutique`,
          outMov.rows[0]!.id, g.user.id,
        ],
      );

      return {
        product_name: p.name,
        quantity: d.quantity,
        from_qty_after: newSrcQty,
        to_qty_after: newDstQty,
        auto_added_to_destination:
          currentScope.length > 0 && !currentScope.includes(d.to_store_id),
      };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stock.transfer',
      entityType: 'product', entityId: d.product_id,
      payload: {
        from_store_id: d.from_store_id, to_store_id: d.to_store_id,
        quantity: d.quantity, reason: d.reason ?? null,
        auto_added_to_destination: result.auto_added_to_destination,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === 'STORE_NOT_FOUND')     return jsonError('STORE_NOT_FOUND', 404);
    if (msg === 'PRODUCT_NOT_FOUND')   return jsonError('PRODUCT_NOT_FOUND', 404);
    if (msg === 'INSUFFICIENT_STOCK')  return jsonError('INSUFFICIENT_STOCK', 409);
    // eslint-disable-next-line no-console
    console.error('[stock.transfer]', err);
    return jsonError('INTERNAL_ERROR', 500, { message: msg });
  }
}
