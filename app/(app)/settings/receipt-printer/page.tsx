import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import { resolveSettingsLockStoreId } from '@/lib/pos/current-store';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
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
  // Sur un poste de caisse appairé, on verrouille la config imprimante sur SA
  // boutique — celle que résout aussi l'impression (/api/pos/ip-printer). Sinon
  // (back-office), null : le sélecteur reste, pour gérer toutes les boutiques.
  const lockStoreId = await resolveSettingsLockStoreId(user.organizationId);
  // Sur un poste de caisse (verrouillé sur sa boutique), on n'affiche que la
  // config du type d'imprimante choisi pour CETTE boutique (Ticket → Paramètres).
  // En back-office (non verrouillé), on garde les deux pour tout gérer.
  const printerType = lockStoreId
    ? (await loadReceiptSettings(user.organizationId, lockStoreId)).printer_type
    : null;
  return (
    <ReceiptPrinterForm
      stores={stores}
      canWrite={canWrite}
      lockStoreId={lockStoreId}
      printerType={printerType}
    />
  );
}
