import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';

const schema = z.object({
  cash_cap: z.number().min(0).max(100000).optional(),
  large_cash_threshold: z.number().min(0).max(100000).optional(),
  allow_bank_deposit: z.boolean().optional(),
  bank_deposit_required: z.boolean().optional(),
  print_bank_deposit_receipt: z.boolean().optional(),
  minimum_float: z.number().min(0).max(10000).optional(),
});

export async function GET() {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<CashSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, CASH_KEY],
  );
  return NextResponse.json({ settings: mergeCashDefaults(rows[0]?.value ?? null) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<CashSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, CASH_KEY],
  );
  const existing = current.rows[0]?.value ?? {};
  const merged = mergeCashDefaults({ ...existing, ...parsed.data });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, CASH_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.cash.update',
    entityType: 'settings',
    payload: parsed.data,
  });

  return NextResponse.json({ settings: merged });
}
