import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

/**
 * Supprime en masse des produits.
 *
 * Stratégie :
 *   1. Tentative de DELETE physique.
 *   2. Si une contrainte FK bloque (produit déjà utilisé dans des
 *      ventes, factures, mouvements stock…), on bascule en SOFT delete :
 *      is_active = false + visible_in_pos = false.
 *
 * Retourne le détail par catégorie : deleted / deactivated / failed.
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, bodySchema);
  if ('response' in parsed) return parsed.response;
  const { ids } = parsed.data;

  let deleted = 0;
  let deactivated = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    try {
      const r = await query(
        `DELETE FROM products WHERE id = $1 AND organization_id = $2`,
        [id, g.user.organizationId],
      );
      if (r.rowCount === 0) {
        failures.push({ id, reason: 'NOT_FOUND' });
        continue;
      }
      deleted++;
    } catch (err) {
      const msg = (err as Error).message || '';
      // FK violation : on désactive au lieu de supprimer
      if (msg.includes('foreign key') || msg.includes('violates')) {
        try {
          const r2 = await query(
            `UPDATE products
                SET is_active = FALSE,
                    visible_in_pos = FALSE,
                    updated_at = now(),
                    updated_by = $3
              WHERE id = $1 AND organization_id = $2`,
            [id, g.user.organizationId, g.user.id],
          );
          if ((r2.rowCount ?? 0) > 0) deactivated++;
          else failures.push({ id, reason: 'NOT_FOUND' });
        } catch (err2) {
          failures.push({ id, reason: (err2 as Error).message });
        }
      } else {
        failures.push({ id, reason: msg });
      }
    }
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.bulk_delete',
    entityType: 'product', entityId: null,
    payload: { deleted, deactivated, failure_count: failures.length, total: ids.length },
  });

  return NextResponse.json({
    deleted, deactivated,
    failure_count: failures.length, failures,
  });
}
