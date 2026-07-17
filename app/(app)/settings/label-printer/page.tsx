import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import LabelPrinterForm from './LabelPrinterForm';

export const dynamic = 'force-dynamic';

/**
 * Réglages de l'imprimante d'étiquettes Star CloudPRNT (mC-Label3).
 * Enregistrement de l'imprimante (MAC + boutique), URL de sondage à saisir
 * sur l'imprimante, et impression de test.
 */
export default async function LabelPrinterPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');
  const stores = await accessibleStores(user);
  return <LabelPrinterForm stores={stores} canWrite={canWrite} />;
}
