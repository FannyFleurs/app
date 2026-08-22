import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import SubscriptionView from './SubscriptionView';

export const dynamic = 'force-dynamic';

export default async function SubscriptionPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  // Abonnement géré UNIQUEMENT depuis le back-office (sous-domaine bo.). Sur la
  // caisse (app.), y compris l'app iOS qui ne charge que app.hellopos.fr, on ne
  // rend pas la vue abonnement : ni plans, ni paiement.
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return (
      <div className="p-8 max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight">Abonnement</h1>
        <p className="mt-2 text-sm text-ink-soft">
          La gestion de votre abonnement HelloPos se fait depuis le back-office,
          sur ordinateur.
        </p>
      </div>
    );
  }
  return <SubscriptionView />;
}
