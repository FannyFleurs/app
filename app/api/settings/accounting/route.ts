import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  ACCOUNTING_ACCOUNTS_KEY,
  mergeAccountingAccounts,
  type AccountingAccounts,
} from '@/lib/settings/accounting';

export const dynamic = 'force-dynamic';

const acct = z.string().min(1).max(20).regex(/^[0-9A-Za-z]+$/);
const schema = z.object({
  sales:     acct.optional(),
  tva_20:    acct.optional(),
  tva_10:    acct.optional(),
  tva_55:    acct.optional(),
  tva_21:    acct.optional(),
  clients:   acct.optional(),
  cash:      acct.optional(),
  bank:      acct.optional(),
  discounts: acct.optional(),
});

export async function GET() {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;
  const { rows } = await query<{ value: Partial<AccountingAccounts> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, ACCOUNTING_ACCOUNTS_KEY],
  );
  return NextResponse.json({ accounts: mergeAccountingAccounts(rows[0]?.value ?? null) });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const current = await query<{ value: Partial<AccountingAccounts> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, ACCOUNTING_ACCOUNTS_KEY],
  );
  const merged = mergeAccountingAccounts({
    ...(current.rows[0]?.value ?? {}),
    ...parsed.data,
  });

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, ACCOUNTING_ACCOUNTS_KEY, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.accounting_accounts.update',
    entityType: 'settings', payload: parsed.data,
  });

  return NextResponse.json({ accounts: merged });
}
