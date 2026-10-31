import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { loadCaRevealOverride, saveCaRevealOverride } from '@/lib/settings/ca-reveal-server';

/**
 * CA du jour visible sur la TopBar de la caisse (icône œil) : réglage PAR
 * BOUTIQUE (voir ca-reveal-server.ts). Distinct du reste de /api/settings/pos
 * (organisation entière) — même motif que show-stock.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || null;
  const enabled = (await loadCaRevealOverride(g.user.organizationId, storeId)) ?? false;
  return NextResponse.json({ enabled });
}

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean(),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('pos.settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, enabled } = parsed.data;

  if (store_id) {
    const owns = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [store_id, g.user.organizationId],
    );
    if (owns.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);
  }

  await saveCaRevealOverride(g.user.organizationId, store_id ?? null, enabled, g.user.id);

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.pos_ca_reveal.update',
    entityType: 'settings',
    payload: { store_id: store_id ?? null, enabled },
  });

  return NextResponse.json({ enabled });
}
