import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Attribue une famille à des lignes de vente « au montant libre » (product_id
 * nul), par libellé exact — SANS passer par un article du catalogue.
 *
 * Complète link-free-lines : rattacher à un article suppose qu'un article du
 * même nom existe déjà (ex. "Bouquet rond"), ce qui n'arrive jamais pour une
 * ligne qui n'en sera jamais un (ex. "Livraison", ajoutée par les commandes
 * entrantes web/OGF — voir order-intake.ts). Ici on pose la famille
 * directement sur la ligne, sans créer ni chercher d'article.
 *
 * Mêmes garanties que link-free-lines : aucun scellé fiscal touché (le hash
 * porte sur le snapshot figé, pas sur la ligne vivante), correction valable
 * pour toutes les ventes de ce libellé quelle que soit la date.
 */

const schema = z.object({
  label: z.string().trim().min(1).max(300),
  category_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { label, category_id } = parsed.data;

  const cat = await query(
    `SELECT 1 FROM product_categories WHERE id = $1 AND organization_id = $2`,
    [category_id, g.user.organizationId],
  );
  if (cat.rowCount === 0) return jsonError('CATEGORY_NOT_FOUND', 404);

  const res = await query(
    `UPDATE sale_lines
        SET category_id = $1
      WHERE organization_id = $2
        AND product_id IS NULL
        AND lower(btrim(label)) = lower(btrim($3))`,
    [category_id, g.user.organizationId, label],
  );

  return NextResponse.json({ updated: res.rowCount ?? 0 });
}
