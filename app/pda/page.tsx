import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PdaApp from './PdaApp';
import PdaPairing from './PdaPairing';

export const dynamic = 'force-dynamic';

/**
 * Station PDA — sous-domaine pda. — app DÉDIÉE (indépendante de la caisse).
 * Connexion par appairage (code ou QR généré en BO). Sans session valide,
 * on affiche l'écran d'appairage (jamais le login caisse).
 */
export default async function PdaStationPage() {
  const user = await readSessionFromCookie();
  if (!user) return <PdaPairing />;
  const canRead = await userCan(user, 'products.read');
  if (!canRead) return <PdaPairing />;
  const canWrite = await userCan(user, 'products.write');
  const canInventory = await userCan(user, 'stock.adjust');
  return <PdaApp canWrite={canWrite} canInventory={canInventory} />;
}
