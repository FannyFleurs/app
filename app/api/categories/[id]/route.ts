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
