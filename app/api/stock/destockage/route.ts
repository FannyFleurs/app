import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction, query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { FiscalCore } from '@/lib/fiscal/core';

const schema = z.object({
  store_id: z.string().uuid(),
  reason: z.string().min(1).max(200),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    variant_id: z.string().uuid().optional().nullable(),
    quantity: z.number().positive(),
  })).min(1).max(500),
});

/**
 * Déstockage : série de sorties de stock (casse, péremption, perte…) scannée
 * à la chaîne sur le PDA, validée en UNE transaction. Chaque article suit la
 * même logique NULL-safe que /api/stock/movement(.batch), mais toujours en
 * movement_type='loss' (quantité négative) — ce n'est jamais une entrée.
 *
 * La série reçoit un code unique (ex. D-2026-000013, via FiscalCore.
 * nextDocumentNumber) à noter sur le contenant jeté, et chaque mouvement
 * référence la série via source_type/source_id (colonnes déjà présentes sur
 * stock_movements, jusqu'ici inutilisées).
 */
export async function POST(req: Request) {
  const g = await requirePermission('stock.adjust');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  try {
    const result = await withTransaction(async (client) => {
      const year = new Date().getUTCFullYear();
      const fiscal = new FiscalCore(client);
      const { formatted: reference } = await fiscal.nextDocumentNumber({
        organizationId: g.user.organizationId,
        kind: 'destockage',
        year,
        prefix: 'D',
      });

      const totalQuantity = d.items.reduce((s, it) => s + it.quantity, 0);
      const batch = await client.query<{ id: string }>(
        `INSERT INTO destockage_batches
           (organization_id, store_id, reference, reason, item_count, total_quantity, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [g.user.organizationId, d.store_id, reference, d.reason, d.items.length, totalQuantity, g.user.id],
      );
      const batchId = batch.rows[0]!.id;

      for (const it of d.items) {
        const delta = -it.quantity;
        const existing = await client.query<{ id: string; quantity: string }>(
          `SELECT id, quantity FROM stock_levels
            WHERE store_id = $1 AND product_id = $2
              AND variant_id IS NOT DISTINCT FROM $3
            FOR UPDATE`,
          [d.store_id, it.product_id, it.variant_id ?? null],
        );
        let levelId: string;
        let prev: number;
        if (existing.rows[0]) {
          levelId = existing.rows[0].id;
          prev = Number(existing.rows[0].quantity);
        } else {
          const ins = await client.query<{ id: string }>(
            `INSERT INTO stock_levels (organization_id, store_id, product_id, variant_id, quantity)
             VALUES ($1,$2,$3,$4,0) RETURNING id`,
            [g.user.organizationId, d.store_id, it.product_id, it.variant_id ?? null],
          );
          levelId = ins.rows[0]!.id;
          prev = 0;
        }
        const next = Number((prev + delta).toFixed(3));
        await client.query(
          `UPDATE stock_levels SET quantity = $1, updated_at = now() WHERE id = $2`,
          [next, levelId],
        );
        await client.query(
          `INSERT INTO stock_movements
             (organization_id, store_id, product_id, variant_id,
              movement_type, quantity_delta, previous_quantity, new_quantity,
              reason, source_type, source_id, user_id)
           VALUES ($1,$2,$3,$4,'loss',$5,$6,$7,$8,'destockage',$9,$10)`,
          [
            g.user.organizationId, d.store_id, it.product_id, it.variant_id ?? null,
            delta, prev, next, d.reason, batchId, g.user.id,
          ],
        );
      }

      return { id: batchId, reference, item_count: d.items.length, total_quantity: totalQuantity };
    });

    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'stock.destockage', entityType: 'destockage_batch', entityId: result.id,
      payload: { reference: result.reference, item_count: result.item_count, reason: d.reason },
    });

    // Même best-effort que l'entrée multiple : déstocker un article implique
    // qu'on le suit, sinon les ventes ne décompteraient pas ce stock.
    try {
      const ids = [...new Set(d.items.map((it) => it.product_id))];
      await query(
        `UPDATE products SET track_stock = TRUE
          WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND COALESCE(track_stock, FALSE) = FALSE`,
        [g.user.organizationId, ids],
      );
    } catch { /* colonne track_stock absente : rien à faire */ }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[stock.destockage]', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: (err as Error).message }, { status: 500 });
  }
}
