import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import LoyaltySettingsForm from './LoyaltySettingsForm';

export const dynamic = 'force-dynamic';

export default async function LoyaltySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const settings = mergeWithDefaults(rows[0]?.value ?? null);
  const canEdit = (await userCan(user, 'settings.write'));

  return <LoyaltySettingsForm initial={settings} canEdit={canEdit} />;
}
