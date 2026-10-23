import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  STOCK_MOVEMENT_REASONS_KEY,
  mergeStockMovementReasonsDefaults,
  type StockMovementReasonsSettings,
} from '@/lib/settings/stock-movement-reasons';

const schema = z.object({
  reasons: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    justification_required: z.boolean(),
  })).max(30).optional(),
});

async function load(organizationId: string) {
  const { rows } = await query<{ value: Partial<StockMovementReasonsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, STOCK_MOVEMENT_REASONS_KEY],
  );
  return rows[0]?.value ?? null;
}

/**
 * Lu aussi bien par la page de réglages que par la modale de mouvement de
 * stock (TypeAndReasonModal) — accessible aux mêmes rôles que `stock.adjust`
 * (manager+), donc `settings.read` suffit pour les deux usages.
 */
export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const settings = mergeStockMovementReasonsDefaults(await load(g.user.organizationId));
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await load(g.user.organizationId);
  const merged = mergeStockMovementReasonsDefaults({ ...(existing ?? {}), ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, STOCK_MOVEMENT_REASONS_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.stock_movement_reasons.update',
    entityType: 'settings',
    payload: parsed.data,
  });

  return NextResponse.json({ settings: merged });
}
