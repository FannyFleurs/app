import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { RECEIPT_KEY, mergeReceiptDefaults, type ReceiptSettings } from '@/lib/settings/receipt';
import ReceiptSettingsForm from './ReceiptSettingsForm';

export const dynamic = 'force-dynamic';

export default async function ReceiptSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const { rows } = await query<{ value: Partial<ReceiptSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, RECEIPT_KEY],
  );
  const settings = mergeReceiptDefaults(rows[0]?.value ?? null);
  const canEdit = (await userCan(user, 'settings.write'));

  return <ReceiptSettingsForm initial={settings} canEdit={canEdit} />;
}
