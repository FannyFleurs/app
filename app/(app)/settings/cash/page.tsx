import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { CASH_KEY, mergeCashDefaults, type CashSettings } from '@/lib/settings/cash';
import CashSettingsForm from './CashSettingsForm';

export const dynamic = 'force-dynamic';

export default async function CashSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const { rows } = await query<{ value: Partial<CashSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, CASH_KEY],
  );
  const settings = mergeCashDefaults(rows[0]?.value ?? null);
  const canEdit = (await userCan(user, 'settings.write'));

  return <CashSettingsForm initial={settings} canEdit={canEdit} />;
}
