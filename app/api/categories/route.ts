import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';

const schema = z.object({
  name: z.string().min(1).max(120),
  parent_id: z.string().uuid().nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  image_url: z.string().max(2048).nullable().optional(),
  position: z.number().int().nonnegative().default(0),
  visible_in_pos: z.boolean().default(true),
  store_ids: z.array(z.string().uuid()).optional(),
});

// Introspection : la colonne product_categories.store_ids (migration 0046)
// est-elle présente ? Fail-open tant que la migration n'est pas déployée.
let _hasStoreIds: boolean | null = null;
async function hasStoreIdsColumn(): Promise<boolean> {
  if (_hasStoreIds !== null) return _hasStoreIds;
  try {
    const { rows } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'product_categories' AND column_name = 'store_ids'
       ) AS exists`,
    );
    _hasStoreIds = rows[0]?.exists ?? false;
  } catch { _hasStoreIds = false; }
  return _hasStoreIds;
}

// Introspection : colonne transport_cost_ht (migration 0047).
let _hasTransport: boolean | null = null;
async function hasTransportColumn(): Promise<boolean> {
  if (_hasTransport !== null) return _hasTransport;
  try {
    const { rows } = await query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'product_categories' AND column_name = 'transport_cost_ht'
       ) AS exists`,
    );
    _hasTransport = rows[0]?.exists ?? false;
  } catch { _hasTransport = false; }
  return _hasTransport;
}

export async function GET(req: Request) {
  const g = await requirePermission('products.read');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const storeId = url.searchParams.get('store_id') || undefined;
  const inPos = url.searchParams.get('pos') === '1';
  // Hors back-office (sous-domaine bo.), chaque poste ne voit QUE les
  // catégories de sa boutique — comme les articles.
  const backOffice = req.headers.get('x-webpos-bo') === '1';
  const hasStore = await hasStoreIdsColumn();
  const storeCol = hasStore ? 'store_ids' : `'{}'::uuid[] AS store_ids`;
  const params: unknown[] = [g.user.organizationId];
  let where = 'organization_id = $1 AND is_active = TRUE';
  // Verrouillage boutique : un utilisateur rattaché à des boutiques précises
  // ne voit que les catégories partagées (store_ids vide) ou attribuées à
  // l'une de ses boutiques. Owner/super_admin voient tout.
  if (hasStore && !['super_admin', 'owner'].includes(g.user.role)) {
    const acc = await query<{ store_id: string }>(
      `SELECT store_id FROM user_store_access WHERE user_id = $1`,
      [g.user.id],
    );
    if (acc.rows.length > 0) {
      params.push(acc.rows.map((r) => r.store_id));
      where += ` AND (COALESCE(array_length(store_ids, 1), 0) = 0 OR store_ids && $${params.length}::uuid[])`;
    }
  }
  // Filtre boutique explicite.
  //  - Application (hors BO) : STRICT — uniquement les catégories rattachées à
  //    la boutique du poste, dès que l'organisation compte plusieurs boutiques.
  //    Une catégorie « toutes boutiques » (store_ids vide) n'apparaît pas.
  //  - Back-office : « vide » (toutes) OU la boutique demandée.
  if (storeId && hasStore) {
    params.push(storeId);
    const storeParamIdx = params.length;
    let strict = false;
    if (inPos || !backOffice) {
      const c = await query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM stores
          WHERE organization_id = $1 AND is_active = TRUE`,
        [g.user.organizationId],
      );
      strict = Number(c.rows[0]?.n ?? '1') > 1;
    }
    where += strict
      ? ` AND store_ids @> ARRAY[$${storeParamIdx}]::uuid[]`
      : ` AND (COALESCE(array_length(store_ids, 1), 0) = 0 OR store_ids @> ARRAY[$${storeParamIdx}]::uuid[])`;
  }
  const hasTransport = await hasTransportColumn();
  const transportCol = hasTransport ? 'transport_cost_ht' : '0 AS transport_cost_ht';
  const pctCol = hasTransport ? 'transport_cost_pct' : 'NULL::numeric AS transport_cost_pct';
  const { rows } = await query(
    `SELECT id, name, parent_id, color, icon, image_url, position, visible_in_pos, is_active, ${storeCol}, ${transportCol}, ${pctCol}
       FROM product_categories
      WHERE ${where}
      ORDER BY position ASC, name ASC`,
    params,
  );
  return NextResponse.json({ categories: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('categories.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const c = parsed.data;
  try {
    // Rattachement boutique : fourni (back-office) → tel quel ; absent (app) →
    // boutique(s) de l'utilisateur (owner/sans rattachement = catégorie
    // partagée, store_ids vide).
    let storeCols = '';
    const extra: unknown[] = [];
    if (await hasStoreIdsColumn()) {
      let storeIds: string[];
      if (c.store_ids !== undefined) {
        storeIds = c.store_ids;
      } else if (['super_admin', 'owner'].includes(g.user.role)) {
        storeIds = [];
      } else {
        const acc = await query<{ store_id: string }>(
          `SELECT store_id FROM user_store_access WHERE user_id = $1`,
          [g.user.id],
        );
        storeIds = acc.rows.map((r) => r.store_id);
      }
      storeCols = ', store_ids';
      extra.push(storeIds);
    }
    const ins = await query<{ id: string }>(
      `INSERT INTO product_categories
         (organization_id, name, parent_id, color, icon, image_url, position, visible_in_pos${storeCols})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8${storeCols ? ',$9' : ''}) RETURNING id`,
      [
        g.user.organizationId,
        c.name,
        c.parent_id ?? null,
        c.color ?? null,
        c.icon ?? null,
        c.image_url ?? null,
        c.position,
        c.visible_in_pos,
        ...extra,
      ],
    );
    return NextResponse.json({ id: ins.rows[0]!.id }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[categories.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('image_url')
      ? 'Migration manquante : exécutez `npm run db:migrate` pour appliquer 0003_category_image.sql.'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
