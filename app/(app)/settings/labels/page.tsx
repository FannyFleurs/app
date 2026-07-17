import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { LABEL_KEY, mergeLabelDefaults, type LabelSettings } from '@/lib/settings/label';
import LabelSettingsForm from './LabelSettingsForm';

export const dynamic = 'force-dynamic';

export default async function LabelSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const { rows } = await query<{ value: Partial<LabelSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, LABEL_KEY],
  );
  const settings = mergeLabelDefaults(rows[0]?.value ?? null);
  const canEdit = await userCan(user, 'settings.write');
  return <LabelSettingsForm initial={settings} canEdit={canEdit} />;
}
