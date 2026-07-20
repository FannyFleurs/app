import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import LabelStationsManager from './LabelStationsManager';

export const dynamic = 'force-dynamic';

/**
 * Paramétrage des PDA (stations d'impression d'étiquettes) par boutique.
 * Back-office uniquement.
 */
export default async function LabelStationsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');
  const stores = await accessibleStores(user);
  return <LabelStationsManager canWrite={canWrite} stores={stores} />;
}
