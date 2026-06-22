import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { mergeWithDefaults, POS_UI_KEY, type PosUiSettings } from '@/lib/settings/pos-ui';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const settings = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(settings.rows[0]?.value ?? null);

  const acc = await query<{ id: string; points_balance: number }>(
    `SELECT id, points_balance FROM loyalty_accounts WHERE customer_id = $1`,
    [params.id],
  );
  const account = acc.rows[0] ?? { id: null, points_balance: 0 };

  return NextResponse.json({
    loyalty: ui.loyalty,
    account_id: account.id ?? null,
    balance_euros: Number(account.points_balance ?? 0), // on stocke en € directement (1 point = 1 €)
  });
}
