import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  store_id: z.string().uuid(),
  // Par défaut on PRÉSERVE les commandes entrantes (app Commande) : ce sont de
  // vraies commandes clients, pas des paniers oubliés. Passer true pour tout
  // vider, y compris les commandes.
  include_orders: z.boolean().optional().default(false),
});

/**
 * Vide en masse les paniers EN ATTENTE d'une boutique : supprime les ventes
 * `on_hold` (jamais validées → aucun impact fiscal ; lignes/paiements en
 * cascade). Sert à nettoyer un empilement de paniers de test / oubliés.
 * Ne touche JAMAIS aux ventes validées (protégées par trigger de toute façon).
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, include_orders } = parsed.data;

  const deleted = await withTransaction(async (client) => {
    const orderFilter = include_orders
      ? ''
      : `AND COALESCE(to_jsonb(sales) -> 'delivery_info' ->> 'source', '') <> 'commande'`;
    const res = await client.query(
      `DELETE FROM sales
        WHERE organization_id = $1 AND store_id = $2 AND status = 'on_hold'
          ${orderFilter}`,
      [g.user.organizationId, store_id],
    );
    return res.rowCount ?? 0;
  });

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'sales.held.clear',
    entityType: 'store',
    entityId: store_id,
    payload: { deleted, include_orders },
  });

  return NextResponse.json({ deleted });
}
