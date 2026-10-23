import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  DISCOUNT_REASONS_KEY,
  mergeDiscountReasonsDefaults,
  type DiscountReasonsSettings,
} from '@/lib/settings/discount-reasons';
import DiscountReasonsSettingsForm from './DiscountReasonsSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Motifs de remise — back-office uniquement. Liste des motifs proposés en
 * caisse pour une remise manuelle, et obligation ou non de les justifier.
 * Réglage au niveau organisation (pas par boutique).
 */
export default async function DiscountReasonsSettingsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');

  const { rows } = await query<{ value: Partial<DiscountReasonsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, DISCOUNT_REASONS_KEY],
  );
  const settings = mergeDiscountReasonsDefaults(rows[0]?.value ?? null);

  return <DiscountReasonsSettingsForm initial={settings} canWrite={canWrite} />;
}
