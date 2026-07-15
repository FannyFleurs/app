import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { storeInOrg } from '@/lib/auth/stores-server';
import { scopedSettingKey } from '@/lib/settings/scoped';
import { OPENING_FLOAT_KEY, mergeOpeningFloat } from '@/lib/settings/opening-float';
import { loadOpeningFloat } from '@/lib/settings/opening-float-server';
import { OPENING_FLOAT_MODES } from '@/lib/settings/pos-ui';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  mode: z.enum(OPENING_FLOAT_MODES).optional(),
  amount: z.number().min(0).max(100000).optional(),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  const settings = await loadOpeningFloat(g.user.organizationId, storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id: storeId, ...fields } = parsed.data;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }

  // On repart de la valeur effective (boutique, sinon org/pos_ui) pour que les
  // champs non modifiés conservent leur valeur héritée.
  const existing = await loadOpeningFloat(g.user.organizationId, storeId);
  const merged = mergeOpeningFloat({ ...existing, ...fields });
  const key = scopedSettingKey(OPENING_FLOAT_KEY, storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.opening_float.update',
    entityType: 'settings', entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, ...fields },
  });

  return NextResponse.json({ settings: merged });
}
