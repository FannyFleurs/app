import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import CommandesRejeteesClient from './CommandesRejeteesClient';

export const dynamic = 'force-dynamic';

/**
 * Commandes externes rejetées (app commande WEB/OGF) — diagnostic en
 * back-office. L'app commande ne vérifie pas la réponse de HelloPos et
 * confirme toujours au client : sans cette page, une commande rejetée ici
 * (jeton, boutique non mappée, erreur interne) ou dont l'encaissement
 * automatique échoue après coup est invisible, nulle part ailleurs. Voir
 * app/api/orders/incoming/route.ts et lib/services/order-intake.ts.
 */
export default async function CommandesRejeteesPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Cette page est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <CommandesRejeteesClient />;
}
