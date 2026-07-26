'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Frontière d'erreur au niveau des routes (segments sous le layout racine).
 * Évite l'écran blanc brut de Next quand un composant lève une exception :
 * on affiche un écran de secours sobre, aux couleurs de l'app, avec un
 * bouton « Réessayer » (re-render du segment) et un retour caisse.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app-error]', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] grid place-items-center p-8 bg-bg">
      <div className="card p-8 max-w-md w-full text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
          !
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-ink-soft">
          La page n&apos;a pas pu s&apos;afficher. Réessaie&nbsp;; si le problème persiste,
          recharge l&apos;application.
        </p>
        <div className="mt-6 flex gap-2 justify-center">
          <button onClick={() => reset()} className="btn-primary h-11 px-5">
            Réessayer
          </button>
          <Link href="/caisse" className="btn-soft h-11 px-5 inline-flex items-center">
            Retour à la caisse
          </Link>
        </div>
        {error?.digest && (
          <p className="mt-4 text-[11px] text-ink-soft">Réf. {error.digest}</p>
        )}
      </div>
    </div>
  );
}
