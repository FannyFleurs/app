import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  archived: z.boolean(),
});

/**
 * Archive (ou remet en rayon) une sélection d'articles.
 *
 * Pensé pour la purge de fin de saison : sur la page Stock, la liste des
 * articles à 0 se coche d'un bloc et sort de la caisse en une fois. Rien n'est
 * supprimé — les ventes passées y renvoient, et le même écran les rend.
 *
 * `visible_in_pos` suit `is_active` : un article remis en rayon doit
 * réapparaître sur les tuiles, sinon on croirait le désarchivage sans effet.
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, bodySchema);
  if ('response' in parsed) return parsed.response;
  const { ids, archived } = parsed.data;

  const r = await query(
    `UPDATE products
        SET is_active = $3, visible_in_pos = $3,
            updated_at = now(), updated_by = $4
      WHERE organization_id = $2 AND id = ANY($1::uuid[])`,
    [ids, g.user.organizationId, !archived, g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: archived ? 'products.bulk_archive' : 'products.bulk_unarchive',
    entityType: 'product', entityId: null,
    payload: { count: r.rowCount ?? 0, requested: ids.length },
  });

  return NextResponse.json({ updated: r.rowCount ?? 0 });
}
