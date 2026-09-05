import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  SCREEN_DELIVERY_KEY,
  mergeScreenDeliveryDefaults,
  type ScreenDeliverySettings,
} from '@/lib/settings/screen-delivery';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';

// « Écran & Livraison » est une option AU NIVEAU ORGANISATION (elle fait partie
// de l'offre). Un seul réglage pour toute l'organisation, plus de portée par
// boutique.
const schema = z.object({
  enabled: z.boolean().optional(),
  min_lead_hours: z.number().min(0).max(720).optional(),
  delivery_enabled: z.boolean().optional(),
  delivery_fee: z.number().min(0).max(10000).optional(),
  screen_url: z.string().max(500).optional(),
  screen_welcome: z.string().max(200).optional(),
});

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const value = await loadScopedSettingValue<ScreenDeliverySettings>(
    g.user.organizationId, SCREEN_DELIVERY_KEY, null,
  );
  return NextResponse.json({ settings: mergeScreenDeliveryDefaults(value) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await loadScopedSettingValue<ScreenDeliverySettings>(
    g.user.organizationId, SCREEN_DELIVERY_KEY, null,
  );
  const merged = mergeScreenDeliveryDefaults({ ...existing, ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, SCREEN_DELIVERY_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.screen_delivery.update',
    entityType: 'settings', entityId: null,
    payload: { ...parsed.data },
  });

  return NextResponse.json({ settings: merged });
}
