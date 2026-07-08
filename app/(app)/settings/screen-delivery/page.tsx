import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  SCREEN_DELIVERY_KEY,
  mergeScreenDeliveryDefaults,
  type ScreenDeliverySettings,
} from '@/lib/settings/screen-delivery';
import ScreenDeliveryForm from './ScreenDeliveryForm';

export const dynamic = 'force-dynamic';

export default async function ScreenDeliverySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'pos.use'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const { rows } = await query<{ value: Partial<ScreenDeliverySettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, SCREEN_DELIVERY_KEY],
  );
  const settings = mergeScreenDeliveryDefaults(rows[0]?.value ?? null);
  const canEdit = await userCan(user, 'settings.write');

  return <ScreenDeliveryForm initial={settings} canEdit={canEdit} />;
}
