import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import ReceiptPrinterForm from './ReceiptPrinterForm';

export const dynamic = 'force-dynamic';

/**
 * Réglages de l'imprimante TICKET Star CloudPRNT (ex. TSP143 / mC-Print3),
 * avec tiroir-caisse branché dessus. Enregistrement (MAC + boutique), URL de
 * sondage, test ticket + ouverture tiroir.
 */
export default async function ReceiptPrinterPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');
  const stores = await accessibleStores(user);
  return <ReceiptPrinterForm stores={stores} canWrite={canWrite} />;
}
