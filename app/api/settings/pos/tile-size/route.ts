import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { POS_TILE_SIZES, POS_UI_DEFAULTS } from '@/lib/settings/pos-ui';
import { loadTileSizeOverride, saveTileSizeOverride } from '@/lib/settings/tile-size-server';

/**
 * Taille des tuiles produit : réglage PAR BOUTIQUE (voir tile-size-server.ts).
 * Distinct du reste de /api/settings/pos (organisation entière).
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || null;
  const tile_size = (await loadTileSizeOverride(g.user.organizationId, storeId)) ?? POS_UI_DEFAULTS.tile_size;
  return NextResponse.json({ tile_size });
}

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  tile_size: z.enum(POS_TILE_SIZES),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('pos.settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, tile_size } = parsed.data;

  if (store_id) {
    const owns = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [store_id, g.user.organizationId],
    );
    if (owns.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);
  }

  await saveTileSizeOverride(g.user.organizationId, store_id ?? null, tile_size, g.user.id);

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.pos_tile_size.update',
    entityType: 'settings',
    payload: { store_id: store_id ?? null, tile_size },
  });

  return NextResponse.json({ tile_size });
}
