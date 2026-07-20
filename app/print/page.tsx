import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PrintLabelApp from './PrintLabelApp';

export const dynamic = 'force-dynamic';

/**
 * Station d'impression d'étiquettes (PDA) — sous-domaine print.
 * Mono-usage : liste d'articles + recherche/scan + aperçu étiquette +
 * quantité (clavier virtuel) + impression (CloudPRNT ou navigateur).
 */
export default async function PrintStationPage() {
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
  return <PrintLabelApp userName={user.fullName} />;
}
