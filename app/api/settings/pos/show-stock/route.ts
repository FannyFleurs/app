import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { POS_UI_DEFAULTS } from '@/lib/settings/pos-ui';
import { loadShowStockOverride, saveShowStockOverride } from '@/lib/settings/show-stock-server';

/**
 * Affichage de la bulle de stock sur la tuile produit : réglage PAR
 * BOUTIQUE (voir show-stock-server.ts). Distinct du reste de
 * /api/settings/pos (organisation entière) — même motif que tile-size.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || null;
  const show_stock = (await loadShowStockOverride(g.user.organizationId, storeId)) ?? POS_UI_DEFAULTS.show_stock;
  return NextResponse.json({ show_stock });
}

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  show_stock: z.boolean(),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('pos.settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, show_stock } = parsed.data;

  if (store_id) {
    const owns = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [store_id, g.user.organizationId],
    );
    if (owns.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);
  }

  await saveShowStockOverride(g.user.organizationId, store_id ?? null, show_stock, g.user.id);

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.pos_show_stock.update',
    entityType: 'settings',
    payload: { store_id: store_id ?? null, show_stock },
  });

  return NextResponse.json({ show_stock });
}
