import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { hasCategoryDiscountsTable } from '@/lib/settings/category-discounts-server';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const discountEntrySchema = z.object({
  store_id: z.string().uuid(),
  discount_type: z.enum(['percent', 'amount']),
  discount_value: z.number().positive(),
  always_active: z.boolean(),
  start_date: dateStr.nullable().optional(),
  end_date: dateStr.nullable().optional(),
}).refine(
  (d) => (d.always_active
    ? (!d.start_date && !d.end_date)
    : (!!d.start_date && !!d.end_date && d.start_date <= d.end_date)),
  { message: 'DATE_RANGE_REQUIRED' },
).refine(
  (d) => d.discount_type !== 'percent' || d.discount_value <= 100,
  { message: 'PERCENT_OUT_OF_RANGE' },
);

const putSchema = z.object({ discounts: z.array(discountEntrySchema) });

/**
 * Remises automatiques par boutique configurées pour cette catégorie (page
 * Catégories, back-office). Une entrée par boutique qui a une remise active
 * ou programmée ; l'absence d'entrée pour une boutique = aucune remise.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;
  if (!(await hasCategoryDiscountsTable())) return NextResponse.json({ discounts: [] });

  const cat = await query(
    `SELECT 1 FROM product_categories WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cat.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const { rows } = await query<{
    store_id: string; discount_type: string; discount_value: string;
    always_active: boolean; start_date: string | null; end_date: string | null;
  }>(
    `SELECT store_id, discount_type, discount_value::text AS discount_value,
            always_active, start_date::text AS start_date, end_date::text AS end_date
       FROM category_discounts
      WHERE category_id = $1 AND organization_id = $2
      ORDER BY store_id`,
    [params.id, g.user.organizationId],
  );
  return NextResponse.json({
    discounts: rows.map((r) => ({ ...r, discount_value: Number(r.discount_value) })),
  });
}

/**
 * Remplace l'ensemble des remises automatiques de cette catégorie (au plus
 * une par boutique) — enregistré en une fois depuis le formulaire catégorie.
 * Une boutique absente de la liste voit sa remise supprimée.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;
  if (!(await hasCategoryDiscountsTable())) return jsonError('NOT_MIGRATED', 503);

  const cat = await query(
    `SELECT 1 FROM product_categories WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (cat.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const parsed = await parseJson(req, putSchema);
  if ('response' in parsed) return parsed.response;
  const { discounts } = parsed.data;

  const storeIds = discounts.map((d) => d.store_id);
  if (new Set(storeIds).size !== storeIds.length) return jsonError('DUPLICATE_STORE', 400);
  if (storeIds.length > 0) {
    // Sécurité : les boutiques ciblées appartiennent bien à l'organisation.
    const own = await query<{ id: string }>(
      `SELECT id FROM stores WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, storeIds],
    );
    const allowed = new Set(own.rows.map((r) => r.id));
    if (storeIds.some((id) => !allowed.has(id))) return jsonError('STORE_NOT_FOUND', 404);
  }

  await withTransaction(async (client) => {
    // storeIds vide : ARRAY[]::uuid[] ne matche jamais via =ANY, donc NOT(...)
    // est toujours vrai → supprime tout, ce qui est le comportement voulu.
    await client.query(
      `DELETE FROM category_discounts
        WHERE category_id = $1 AND organization_id = $2
          AND NOT (store_id = ANY($3::uuid[]))`,
      [params.id, g.user.organizationId, storeIds],
    );
    for (const d of discounts) {
      await client.query(
        `INSERT INTO category_discounts
           (organization_id, category_id, store_id, discount_type, discount_value,
            always_active, start_date, end_date, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (category_id, store_id) DO UPDATE
           SET discount_type = EXCLUDED.discount_type,
               discount_value = EXCLUDED.discount_value,
               always_active = EXCLUDED.always_active,
               start_date = EXCLUDED.start_date,
               end_date = EXCLUDED.end_date,
               updated_at = now(),
               updated_by = EXCLUDED.updated_by`,
        [
          g.user.organizationId, params.id, d.store_id, d.discount_type, d.discount_value,
          d.always_active, d.always_active ? null : d.start_date, d.always_active ? null : d.end_date,
          g.user.id,
        ],
      );
    }
  });

  return NextResponse.json({ ok: true });
}
