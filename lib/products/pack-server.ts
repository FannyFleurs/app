import 'server-only';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { MAX_PACK_ITEMS } from './pack';

export const packSchema = z.object({
  name: z.string().min(1).max(200),
  category_id: z.string().uuid().nullable().optional(),
  visible_in_pos: z.boolean().default(true),
  is_active: z.boolean().default(true),
  discount_ttc: z.number().min(0).default(0),
  store_ids: z.array(z.string().uuid()).optional(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().positive().max(999).default(1),
  })).min(1).max(MAX_PACK_ITEMS),
});

export type PackInput = z.infer<typeof packSchema>;

/**
 * TVA d'un pack : un pack n'a pas de TVA propre, il éclate à la vente en ses
 * composants (chacun avec SA TVA). La colonne products.tax_rate_id étant
 * obligatoire, on y met le taux par défaut de l'organisation (à défaut, le
 * premier taux actif). Renvoie null si l'organisation n'a aucun taux.
 */
export async function defaultTaxRateId(organizationId: string): Promise<string | null> {
  const r = await query<{ id: string }>(
    `SELECT id FROM tax_rates
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY is_default DESC, rate DESC
      LIMIT 1`,
    [organizationId],
  );
  return r.rows[0]?.id ?? null;
}

export async function productColumnExists(col: string): Promise<boolean> {
  const r = await query<{ e: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = $1) AS e`,
    [col],
  );
  return r.rows[0]?.e ?? false;
}

/** Charge prix + validité des composants (même org, non-pack). */
export async function loadPackComponents(
  organizationId: string,
  items: { product_id: string; quantity: number }[],
) {
  const ids = items.map((i) => i.product_id);
  const r = await query<{ id: string; sale_price_ttc: string; is_pack: boolean }>(
    `SELECT id, sale_price_ttc, COALESCE(is_pack, FALSE) AS is_pack
       FROM products WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
    [organizationId, ids],
  );
  const byId = new Map(r.rows.map((x) => [x.id, x]));
  return items.map((it) => {
    const p = byId.get(it.product_id);
    return {
      product_id: it.product_id,
      quantity: it.quantity,
      price: p ? Number(p.sale_price_ttc) : NaN,
      is_pack: p ? p.is_pack : true,
      found: !!p,
    };
  });
}
