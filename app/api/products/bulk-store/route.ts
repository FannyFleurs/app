import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(5000),
  // Boutiques cibles. Vide = toutes les boutiques (article partagé).
  store_ids: z.array(z.string().uuid()).max(50),
});

/**
 * Attribue en masse une (ou plusieurs) boutique(s) à des articles.
 * Utile pour corriger un import qui a laissé les articles « toutes boutiques ».
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { product_ids, store_ids } = parsed.data;

  // Colonne présente ? (migration 0025)
  const col = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='products' AND column_name='store_ids') AS exists`,
  );
  if (!col.rows[0]?.exists) {
    return NextResponse.json({ error: 'STORE_SCOPING_UNAVAILABLE' }, { status: 400 });
  }

  // Les boutiques doivent appartenir à l'organisation.
  if (store_ids.length > 0) {
    const valid = await query<{ id: string }>(
      `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, store_ids],
    );
    if (valid.rowCount !== store_ids.length) {
      return NextResponse.json({ error: 'INVALID_STORE' }, { status: 400 });
    }
  }

  const res = await query(
    `UPDATE products SET store_ids = $3, updated_at = now()
      WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [g.user.organizationId, product_ids, store_ids],
  );

  return NextResponse.json({ updated: res.rowCount ?? 0 });
}
