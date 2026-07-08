import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import BackOfficeLoginForm from './BackOfficeLoginForm';

export const dynamic = 'force-dynamic';

/**
 * Ecran de connexion du back-office (sous-domaine bo. ou path /bo).
 * On utilise ici email + mot de passe (identifiants admin), pas le
 * PIN — le back-office est accessible depuis n'importe ou (mobile,
 * ordinateur perso...) et n'est donc pas lie a un poste physique.
 */
export default async function BackOfficeLoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/');

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white text-2xl font-semibold mb-3"
            style={{ backgroundColor: 'var(--primary, #6d5b3f)' }}
          >
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Back-office</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Connectez-vous avec votre email et votre mot de passe administrateur.
          </p>
        </div>
        <div className="card p-6">
          <BackOfficeLoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-ink-soft">
          Retour à la <a href="/login" className="underline hover:text-ink">caisse</a>
        </p>
      </div>
    </main>
  );
}
