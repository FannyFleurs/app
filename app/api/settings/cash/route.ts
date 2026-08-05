import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';
import { storeInOrg } from '@/lib/auth/stores-server';
import { scopedSettingKey } from '@/lib/settings/scoped';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  cash_cap: z.number().min(0).max(100000).optional(),
  large_cash_threshold: z.number().min(0).max(100000).optional(),
  allow_bank_deposit: z.boolean().optional(),
  bank_deposit_required: z.boolean().optional(),
  print_bank_deposit_receipt: z.boolean().optional(),
  minimum_float: z.number().min(0).max(10000).optional(),
  shared_float: z.boolean().optional(),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  const value = await loadScopedSettingValue<CashSettings>(
    g.user.organizationId, CASH_KEY, storeId,
  );
  return NextResponse.json({ settings: mergeCashDefaults(value) });
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

  const existing = await loadScopedSettingValue<CashSettings>(
    g.user.organizationId, CASH_KEY, storeId,
  );
  const merged = mergeCashDefaults({ ...existing, ...fields });
  const key = scopedSettingKey(CASH_KEY, storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.cash.update',
    entityType: 'settings', entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, ...fields },
  });

  return NextResponse.json({ settings: merged });
}
