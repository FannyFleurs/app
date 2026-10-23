import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  DISCOUNT_REASONS_KEY,
  mergeDiscountReasonsDefaults,
  type DiscountReasonsSettings,
} from '@/lib/settings/discount-reasons';

const schema = z.object({
  reasons: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  justification_required: z.boolean().optional(),
});

async function load(organizationId: string) {
  const { rows } = await query<{ value: Partial<DiscountReasonsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, DISCOUNT_REASONS_KEY],
  );
  return rows[0]?.value ?? null;
}

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const settings = mergeDiscountReasonsDefaults(await load(g.user.organizationId));
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await load(g.user.organizationId);
  const merged = mergeDiscountReasonsDefaults({ ...(existing ?? {}), ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, DISCOUNT_REASONS_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.discount_reasons.update',
    entityType: 'settings',
    payload: parsed.data,
  });

  return NextResponse.json({ settings: merged });
}
