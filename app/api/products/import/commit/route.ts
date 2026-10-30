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
  supplier: z.string().max(200).nullable().optional(),
  sale_price_ttc: z.number().min(0),
  purchase_price_ht: z.number().min(0).nullable().optional(),
  tax_rate_code: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  is_top_product: z.boolean().optional(),
  visible_in_pos: z.boolean().optional(),
  is_active: z.boolean().optional(),
});
const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(20000),
  // Boutique(s) cible de l'import. Vide/absent = toutes les boutiques.
  store_ids: z.array(z.string().uuid()).optional(),
  // Nom du fichier source (affiché tel quel dans « Réception d'import » PDA
  // si l'import est envoyé au PDA — voir /pda route PATCH).
  filename: z.string().max(200).nullable().optional(),
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
  const storeIds = parsed.data.store_ids ?? [];

  let inserted = 0;
  const insertedProductIds: string[] = [];
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

  const supRes = await query<{ id: string; name: string }>(
    `SELECT id, name FROM suppliers WHERE organization_id = $1`,
    [g.user.organizationId],
  );
  const supByName = new Map(
    supRes.rows.map((s) => [s.name.trim().toLowerCase(), s.id]),
  );

  // Détecte si les colonnes optionnelles existent (migrations 0008,
  // 0012, 0018, 0038).
  const colCheck = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products'
        AND column_name IN ('is_top_product','color','store_ids','supplier_id')`,
  );
  const hasTop = colCheck.rows.some((r) => r.column_name === 'is_top_product');
  const hasColor = colCheck.rows.some((r) => r.column_name === 'color');
  const hasStoreIds = colCheck.rows.some((r) => r.column_name === 'store_ids');
  const hasSupplier = colCheck.rows.some((r) => r.column_name === 'supplier_id');
  // Boutiques ciblées (seulement si la colonne existe). Vide = toutes.
  const targetStores = hasStoreIds ? storeIds : [];

  const catStoreCheck = await query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_name='product_categories' AND column_name='store_ids') AS exists`,
  );
  const catHasStoreIds = catStoreCheck.rows[0]?.exists ?? false;

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
            const insCat = catHasStoreIds
              ? await query<{ id: string }>(
                  `INSERT INTO product_categories (organization_id, name, store_ids)
                   VALUES ($1, $2, $3) RETURNING id`,
                  [g.user.organizationId, r.category.trim(), targetStores],
                )
              : await query<{ id: string }>(
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

      // Crée le fournisseur si nécessaire (même principe que la catégorie).
      let supplierId: string | null = null;
      if (hasSupplier && r.supplier && r.supplier.trim()) {
        const key = r.supplier.trim().toLowerCase();
        const existing = supByName.get(key);
        if (existing) {
          supplierId = existing;
        } else {
          try {
            const insSup = await query<{ id: string }>(
              `INSERT INTO suppliers (organization_id, name) VALUES ($1, $2) RETURNING id`,
              [g.user.organizationId, r.supplier.trim()],
            );
            supplierId = insSup.rows[0]!.id;
            supByName.set(key, supplierId);
          } catch (supErr) {
            failures.push({ name: r.name, reason: `Création fournisseur « ${r.supplier} » : ${(supErr as Error).message}` });
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
      if (hasStoreIds) {
        cols.push('store_ids');
        values.push(targetStores);
      }
      if (hasSupplier) {
        cols.push('supplier_id');
        values.push(supplierId);
      }

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const insProduct = await query<{ id: string }>(
        `INSERT INTO products (${cols.join(',')}) VALUES (${placeholders}) RETURNING id`,
        values,
      );
      insertedProductIds.push(insProduct.rows[0]!.id);
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

  // Réception : trace des articles créés par CET import, pour la réception
  // + impression d'étiquettes depuis le PDA (voir app/api/receptions/).
  // Best-effort — un échec ici ne doit jamais faire perdre les produits
  // déjà importés avec succès.
  let receptionId: string | null = null;
  if (insertedProductIds.length > 0) {
    try {
      const reception = await query<{ id: string }>(
        `INSERT INTO receptions (organization_id, filename, store_ids, product_count, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [g.user.organizationId, parsed.data.filename ?? null, targetStores, insertedProductIds.length, g.user.id],
      );
      receptionId = reception.rows[0]!.id;
      const values2: string[] = [];
      const params2: unknown[] = [];
      insertedProductIds.forEach((pid, i) => {
        values2.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params2.push(receptionId, pid);
      });
      await query(
        `INSERT INTO reception_items (reception_id, product_id) VALUES ${values2.join(',')}`,
        params2,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[products.import.reception]', err);
    }
  }

  return NextResponse.json({
    inserted,
    failures,
    failure_count: failures.length,
    reception_id: receptionId,
  });
}
