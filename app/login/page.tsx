import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/dashboard');
  return (
    <main className="min-h-screen grid place-items-center px-4 bg-gradient-to-br from-bg via-beige/40 to-sage-soft">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sage text-white text-xl font-semibold">
            F
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Florea POS</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Caisse pour fleuristes — conforme by design
          </p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-ink-soft">
          Système conforme aux exigences d&apos;inaltérabilité (art. 286, I, 3°bis CGI).
          La certification individuelle reste à effectuer par un organisme habilité.
        </p>
      </div>
    </main>
  );
}
