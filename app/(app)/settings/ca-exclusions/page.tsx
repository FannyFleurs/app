import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  CA_EXCLUSIONS_KEY,
  mergeCaExclusionsDefaults,
  type CaExclusionsSettings,
} from '@/lib/settings/ca-exclusions';
import CaExclusionsSettingsForm from './CaExclusionsSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Exclusions du CA boutique — back-office uniquement. Liste des clients,
 * modes de règlement et catégories produit à retirer du CA quand le
 * toggle « CA boutique uniquement » est activé (Tableau de bord, app CA).
 * Réglage au niveau organisation (pas par boutique).
 */
export default async function CaExclusionsSettingsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');

  const { rows } = await query<{ value: Partial<CaExclusionsSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, CA_EXCLUSIONS_KEY],
  );
  const settings = mergeCaExclusionsDefaults(rows[0]?.value ?? null);

  return <CaExclusionsSettingsForm initial={settings} canWrite={canWrite} />;
}
