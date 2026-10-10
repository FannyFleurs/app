import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { AUTO_LOGOUT_MODES, POS_UI_DEFAULTS } from '@/lib/settings/pos-ui';
import { loadAutoLogoutOverride, saveAutoLogoutOverride } from '@/lib/settings/auto-logout-server';

/**
 * Déconnexion automatique (verrouillage) de la caisse : réglage PAR BOUTIQUE
 * (voir auto-logout-server.ts). Distinct du reste de /api/settings/pos
 * (organisation entière).
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || null;
  const override = await loadAutoLogoutOverride(g.user.organizationId, storeId);
  return NextResponse.json({
    auto_logout_mode: override?.auto_logout_mode ?? POS_UI_DEFAULTS.auto_logout_mode,
    auto_logout_minutes: override?.auto_logout_minutes ?? POS_UI_DEFAULTS.auto_logout_minutes,
  });
}

const schema = z.object({
  store_id: z.string().uuid().nullable().optional(),
  auto_logout_mode: z.enum(AUTO_LOGOUT_MODES),
  auto_logout_minutes: z.number().int().min(1).max(120),
});

export async function PATCH(req: Request) {
  const g = await requirePermission('pos.settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id, auto_logout_mode, auto_logout_minutes } = parsed.data;

  if (store_id) {
    const owns = await query(
      `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2`,
      [store_id, g.user.organizationId],
    );
    if (owns.rowCount === 0) return jsonError('STORE_NOT_FOUND', 404);
  }

  await saveAutoLogoutOverride(
    g.user.organizationId, store_id ?? null,
    { auto_logout_mode, auto_logout_minutes }, g.user.id,
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.pos_auto_logout.update',
    entityType: 'settings',
    payload: { store_id: store_id ?? null, auto_logout_mode, auto_logout_minutes },
  });

  return NextResponse.json({ auto_logout_mode, auto_logout_minutes });
}
