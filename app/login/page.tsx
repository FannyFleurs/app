import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const user = await readSessionFromCookie();
  if (user) redirect('/dashboard');
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      {/* Colonne décorative */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-sage-soft via-beige/60 to-bg p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sage text-white font-semibold text-lg">F</div>
            <div>
              <div className="font-semibold text-lg">Florea POS</div>
              <div className="text-xs text-ink-soft">Caisse pour fleuristes</div>
            </div>
          </div>
        </div>
        <div className="space-y-4 max-w-sm">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">
            Une caisse pensée pour le rush des fleuristes.
          </h2>
          <p className="text-ink-soft">
            Bouquets à prix libre, compositions personnalisées, livraisons, fidélité,
            multi-boutique — le tout sur une base conforme by design aux exigences
            françaises d&apos;inaltérabilité.
          </p>
          <ul className="space-y-2 text-sm text-ink-soft">
            <Bullet>Vendre en moins de 10 secondes au comptoir</Bullet>
            <Bullet>Tickets, factures et clôtures scellés cryptographiquement</Bullet>
            <Bullet>Audit fiscal exportable, journal d&apos;événements append-only</Bullet>
          </ul>
        </div>
        <p className="text-xs text-ink-soft">
          Art. 286, I, 3°bis du CGI · Architecture <em>certification-ready</em>
        </p>
      </div>

      {/* Colonne formulaire */}
      <div className="flex items-center justify-center px-4 py-12 bg-bg">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sage text-white text-xl font-semibold">F</div>
            <h1 className="text-2xl font-semibold tracking-tight">Florea POS</h1>
          </div>
          <div className="card p-7">
            <h2 className="text-xl font-semibold">Connexion</h2>
            <p className="mt-1 text-sm text-ink-soft">Accédez à votre back-office et à votre caisse.</p>
            <div className="mt-5">
              <LoginForm />
            </div>
          </div>
          <p className="mt-4 text-center text-xs text-ink-soft">
            Comptes de démonstration :{' '}
            <code className="px-1.5 py-0.5 rounded bg-white border border-border">owner@florea.test</code>{' '}
            — mot de passe{' '}
            <code className="px-1.5 py-0.5 rounded bg-white border border-border">Florea2026!</code>
          </p>
        </div>
      </div>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-sage mt-0.5">●</span>
      <span>{children}</span>
    </li>
  );
}
