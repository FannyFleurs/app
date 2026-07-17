import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  image_url: z.string().max(2048).nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  visible_in_pos: z.boolean().optional(),
  is_active: z.boolean().optional(),
  store_ids: z.array(z.string().uuid()).optional(),
  transport_cost_ht: z.number().min(0).nullable().optional(),
  transport_cost_pct: z.number().min(0).max(1000).nullable().optional(),
});

// Introspection : une colonne de product_categories existe-t-elle ? (mise en
// cache par nom). Fail-open tant que la migration n'est pas déployée.
const _colCache = new Map<string, boolean>();
async function hasColumn(col: string): Promise<boolean> {
  const cached = _colCache.get(col);
  if (cached !== undefined) return cached;
  let exists = false;
  try {
    const { rows } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'product_categories' AND column_name = $1
       ) AS exists`,
      [col],
    );
    exists = rows[0]?.exists ?? false;
  } catch { exists = false; }
  _colCache.set(col, exists);
  return exists;
}

/**
 * Suppression d'une catégorie.
 *
 * - Avec `?store_id=` : retrait de CETTE boutique uniquement (comme les
 *   articles). La catégorie reste dans les autres boutiques ; on ajuste
 *   simplement son périmètre (store_ids). Suppression réelle seulement si elle
 *   n'était présente que dans cette boutique.
 * - Sans `store_id` : suppression pour toutes les boutiques.
 *
 * Les articles rattachés sont déclassés automatiquement à la vraie suppression
 * (products.category_id → NULL, ON DELETE SET NULL). Blocage éventuel → archivage.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;

  const storeId = new URL(req.url).searchParams.get('store_id');

  // Retrait boutique par boutique (si la colonne store_ids existe).
  if (storeId && (await hasColumn('store_ids'))) {
    const cat = await query<{ store_ids: string[] | null }>(
      `SELECT store_ids FROM product_categories WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
    if (cat.rowCount === 0) return jsonError('NOT_FOUND', 404);
    const current = cat.rows[0]!.store_ids ?? [];

    // store_ids vide = « toutes les boutiques » : retirer une boutique revient
    // à restreindre la catégorie à toutes les AUTRES boutiques.
    let base = current;
    if (current.length === 0) {
      const all = await query<{ id: string }>(
        `SELECT id FROM stores WHERE organization_id = $1 AND is_active = TRUE`,
        [g.user.organizationId],
      );
      base = all.rows.map((r) => r.id);
    }
    const remaining = base.filter((id) => id !== storeId);

    // S'il reste au moins une boutique, on conserve la catégorie ailleurs.
    if (remaining.length > 0) {
      await query(
        `UPDATE product_categories SET store_ids = $3, updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [params.id, g.user.organizationId, remaining],
      );
      return NextResponse.json({ detached_store: true });
    }
    // Sinon (catégorie propre à cette seule boutique) → suppression réelle ci-dessous.
  }

  const cnt = await query<{ n: string }>(
    `SELECT COUNT(*)::text n FROM products WHERE category_id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  const detached = Number(cnt.rows[0]?.n ?? 0);

  try {
    const res = await query(
      `DELETE FROM product_categories WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
    if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
    return NextResponse.json({ deleted: true, detached });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') {
      // Référencée ailleurs : on l'archive (disparaît des listes).
      await query(
        `UPDATE product_categories SET is_active = FALSE, updated_at = now()
          WHERE id = $1 AND organization_id = $2`,
        [params.id, g.user.organizationId],
      );
      return NextResponse.json({ archived: true, detached });
    }
    throw e;
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const patch = { ...parsed.data };
  // Ignore silencieusement les colonnes dont la migration n'est pas déployée.
  if (patch.store_ids !== undefined && !(await hasColumn('store_ids'))) delete patch.store_ids;
  if (patch.transport_cost_ht !== undefined && !(await hasColumn('transport_cost_ht'))) delete patch.transport_cost_ht;
  if (patch.transport_cost_pct !== undefined && !(await hasColumn('transport_cost_pct'))) delete patch.transport_cost_pct;

  const fields = Object.keys(patch);
  if (fields.length === 0) return NextResponse.json({ ok: true });
  const sets = fields.map((f, i) => `${f} = $${i + 1}`);
  const values: unknown[] = fields.map((f) => (patch as Record<string, unknown>)[f]);
  values.push(params.id, g.user.organizationId);
  const res = await query(
    `UPDATE product_categories
        SET ${sets.join(', ')}, updated_at = now()
      WHERE id = $${fields.length + 1} AND organization_id = $${fields.length + 2}`,
    values,
  );
  if (res.rowCount === 0) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ok: true });
}
