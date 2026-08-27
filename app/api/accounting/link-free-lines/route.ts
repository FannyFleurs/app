import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Rattache des lignes de vente « au montant libre » (product_id nul) à un
 * article du catalogue, par libellé exact.
 *
 * Ces ventes ont été saisies au prix sans passer par la fiche article : elles
 * n'ont qu'un libellé et ignorent donc la famille de l'article. On les relie à
 * l'article du même nom ; l'export comme les stats article suivent alors la
 * famille de la fiche.
 *
 * Ceci ne touche AUCUN scellé fiscal : le hash fiscal porte sur le snapshot figé
 * de la vente (fiscal_events.payload), pas sur la ligne vivante. Les montants ne
 * changent pas — seule l'association à l'article est renseignée après coup.
 */

const schema = z.object({
  label: z.string().trim().min(1).max(300),
  product_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { label, product_id } = parsed.data;

  // L'article doit appartenir à l'organisation.
  const prod = await query(
    `SELECT 1 FROM products WHERE id = $1 AND organization_id = $2`,
    [product_id, g.user.organizationId],
  );
  if (prod.rowCount === 0) return jsonError('PRODUCT_NOT_FOUND', 404);

  // Toutes les lignes libres de ce libellé, quelle que soit la date : la
  // correction est complète, le libellé ne restera pas « sans famille » ailleurs.
  const res = await query(
    `UPDATE sale_lines
        SET product_id = $1
      WHERE organization_id = $2
        AND product_id IS NULL
        AND lower(btrim(label)) = lower(btrim($3))`,
    [product_id, g.user.organizationId, label],
  );

  return NextResponse.json({ updated: res.rowCount ?? 0 });
}
