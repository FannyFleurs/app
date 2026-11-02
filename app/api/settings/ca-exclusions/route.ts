import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  CA_EXCLUSIONS_KEY,
  mergeCaExclusionsDefaults,
  type CaExclusionsSettings,
} from '@/lib/settings/ca-exclusions';

const entrySchema = z.union([
  z.object({ type: z.literal('customer'), id: z.string().uuid(), label: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal('category'), id: z.string().uuid(), label: z.string().trim().min(1).max(160) }),
  z.object({ type: z.literal('payment_method'), label: z.string().trim().min(1).max(80) }),
]);

const schema = z.object({
  entries: z.array(entrySchema).max(50).optional(),
});

async function load(organizationId: string) {
  const { rows } = await query<{ value: Partial<CaExclusionsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [organizationId, CA_EXCLUSIONS_KEY],
  );
  return rows[0]?.value ?? null;
}

export async function GET() {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const settings = mergeCaExclusionsDefaults(await load(g.user.organizationId));
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const existing = await load(g.user.organizationId);
  const merged = mergeCaExclusionsDefaults({ ...(existing ?? {}), ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, CA_EXCLUSIONS_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'settings.ca_exclusions.update',
    entityType: 'settings',
    payload: parsed.data,
  });

  return NextResponse.json({ settings: merged });
}
