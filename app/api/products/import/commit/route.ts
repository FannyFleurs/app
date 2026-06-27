import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

const rowSchema = z.object({
  name: z.string().min(1).max(300),
  sku: z.string().max(200).nullable().optional(),
  barcode: z.string().max(100).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  sale_price_ttc: z.number().min(0),
  purchase_price_ht: z.number().min(0).nullable().optional(),
  tax_rate_code: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  is_top_product: z.boolean().optional(),
  visible_in_pos: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(1000),
});

/**
 * Insère réellement les lignes validées par /preview.
 * On revalide tout côté serveur (les flags d'erreur côté client ne sont
 * pas opposables). Les catégories absentes sont créées à la volée.
 * En cas d'erreur sur une ligne, on saute cette ligne et on liste
 * l'échec dans le rapport — pas de rollback global pour ne pas perdre
 * les lignes saines.
 */
export async function POST(req: Request) {
  const g = await requirePermission('products.write');
  if ('response' in g) return g.response;

  const parsed = await parseJson(req, bodySchema);
  if ('response' in parsed) return parsed.response;
  const { rows } = parsed.data;

  let inserted = 0;
  const failures: Array<{ line?: number; name: string; reason: string }> = [];

  // Pré-charge taux TVA + catégories EN DEHORS de toute transaction.
  // Chaque ligne sera insérée dans sa propre requête (autocommit) :
  // une ligne en échec ne casse pas les suivantes.
  const taxRes = await query<{ id: string; code: string }>(
    `SELECT id, code FROM tax_rates WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  const taxByCode = new Map(
    taxRes.rows.map((t) => [t.code.toUpperCase(), t.id]),
  );

  const catRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM product_categories WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  const catByName = new Map(
    catRes.rows.map((c) => [c.name.trim().toLowerCase(), c.id]),
  );

  // Détecte si les colonnes optionnelles existent (migrations 0008,
  // 0012, 0018).
  const colCheck = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products'
        AND column_name IN ('is_top_product','color')`,
  );
  const hasTop = colCheck.rows.some((r) => r.column_name === 'is_top_product');
  const hasColor = colCheck.rows.some((r) => r.column_name === 'color');

  for (const r of rows) {
    try {
      const taxId = taxByCode.get(r.tax_rate_code.toUpperCase());
      if (!taxId) {
        failures.push({ name: r.name, reason: `TVA inconnue : ${r.tax_rate_code}` });
        continue;
      }

      // Crée la catégorie si nécessaire (autocommit, pas de created_by
      // dans le schéma de product_categories).
      let categoryId: string | null = null;
      if (r.category && r.category.trim()) {
        const key = r.category.trim().toLowerCase();
        const existing = catByName.get(key);
        if (existing) {
          categoryId = existing;
        } else {
          try {
            const insCat = await query<{ id: string }>(
              `INSERT INTO product_categories (organization_id, name)
               VALUES ($1, $2) RETURNING id`,
              [g.user.organizationId, r.category.trim()],
            );
            categoryId = insCat.rows[0]!.id;
            catByName.set(key, categoryId);
          } catch (catErr) {
            failures.push({ name: r.name, reason: `Création catégorie « ${r.category} » : ${(catErr as Error).message}` });
            continue;
          }
        }
      }

      const cols = [
        'organization_id', 'name', 'tax_rate_id', 'sale_price_ttc',
        'purchase_price_ht', 'sku', 'barcode', 'category_id',
        'visible_in_pos', 'is_active',
        'price_is_free', 'is_seasonal', 'is_customizable',
        'unit', 'tags', 'created_by', 'updated_by',
      ];
      const values: unknown[] = [
        g.user.organizationId, r.name.trim(), taxId, r.sale_price_ttc,
        r.purchase_price_ht ?? null, r.sku || null, r.barcode || null, categoryId,
        r.visible_in_pos ?? true, r.is_active ?? true,
        false, false, false,
        'unité', [], g.user.id, g.user.id,
      ];
      if (hasTop) {
        cols.push('is_top_product');
        values.push(r.is_top_product ?? false);
      }
      if (hasColor) {
        cols.push('color');
        values.push(r.color ?? null);
      }

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      await query(
        `INSERT INTO products (${cols.join(',')}) VALUES (${placeholders})`,
        values,
      );
      inserted++;
    } catch (err) {
      failures.push({ name: r.name, reason: (err as Error).message });
    }
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'products.import',
    entityType: 'product',
    payload: { inserted, failures: failures.length },
  });

  return NextResponse.json({
    inserted,
    failures,
    failure_count: failures.length,
  });
}
