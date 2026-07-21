import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PdaLabelApp from './PdaLabelApp';

export const dynamic = 'force-dynamic';

/**
 * Station PDA — sous-domaine pda.
 * Écran divisé verticalement : haut = scan / édition étiquette / photo /
 * création d'article ; bas = recherche + liste d'articles (ou fiche de
 * l'article scanné).
 */
export default async function PdaStationPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');
  const canRead = await userCan(user, 'products.read');
  if (!canRead) {
    return (
      <main className="min-h-screen grid place-items-center bg-bg p-6">
        <div className="card max-w-sm w-full p-6 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h1 className="text-lg font-semibold">Accès refusé</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Votre profil ne permet pas d&apos;imprimer des étiquettes.
          </p>
        </div>
      </main>
    );
  }
  const canWrite = await userCan(user, 'products.write');
  return <PdaLabelApp userName={user.fullName} canWrite={canWrite} />;
}
