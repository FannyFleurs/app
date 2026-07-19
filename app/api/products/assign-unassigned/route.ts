import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // Boutique(s) cible(s) à affecter aux articles « toutes boutiques ».
  store_ids: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * Range tous les articles « toutes boutiques » (store_ids vide) sous une (ou
 * plusieurs) boutique(s) donnée(s), en une seule action.
 *
 * Sert à corriger d'anciens imports/produits non rattachés qui apparaissaient
 * sur toutes les caisses : après cette opération, ils ne s'affichent plus que
 * sur la/les boutique(s) choisie(s).
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_ids } = parsed.data;

  const col = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='products' AND column_name='store_ids') AS exists`,
  );
  if (!col.rows[0]?.exists) {
    return NextResponse.json({ error: 'STORE_SCOPING_UNAVAILABLE' }, { status: 400 });
  }

  // Les boutiques doivent appartenir à l'organisation.
  const valid = await query<{ id: string }>(
    `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [g.user.organizationId, store_ids],
  );
  if (valid.rowCount !== store_ids.length) {
    return NextResponse.json({ error: 'INVALID_STORE' }, { status: 400 });
  }

  const res = await query(
    `UPDATE products SET store_ids = $2, updated_at = now()
      WHERE organization_id = $1
        AND COALESCE(array_length(store_ids, 1), 0) = 0`,
    [g.user.organizationId, store_ids],
  );

  return NextResponse.json({ updated: res.rowCount ?? 0 });
}
