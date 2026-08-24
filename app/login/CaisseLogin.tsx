'use client';

import { useEffect, useState } from 'react';
import PinLogin from './PinLogin';
import AuthForm from '@/components/AuthForm';
import { readDeviceId } from '@/lib/device';

const KNOWN_SUBS = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'ecran.', 'www.'];

/**
 * URL de création de boutique (/setup) sur le domaine RACINE (hors sous-domaine
 * `app.`). Ouverte dans un onglet externe : dans l'app iOS (WKWebView limitée à
 * app.hellopos.fr), un autre domaine s'ouvre dans Safari — le tunnel de création
 * et le paiement se font donc hors de l'app, comme l'exige l'App Store.
 */
function setupUrl(): string {
  if (typeof window === 'undefined') return '/setup';
  const host = window.location.host.toLowerCase();
  if (host.startsWith('localhost') || host.endsWith('.vercel.app')) return '/setup';
  const base = KNOWN_SUBS.reduce((h, s) => (h.startsWith(s) ? h.slice(s.length) : h), host);
  return `https://${base}/setup`;
}

/**
 * Écran de connexion caisse. La connexion EMAIL n'est nécessaire qu'à la
 * PREMIÈRE connexion sur un poste (pour rattacher la boutique). Une fois la
 * boutique connue sur cet appareil, on affiche directement la connexion par
 * PIN. Un lien discret permet de basculer d'un mode à l'autre.
 *
 * Le formulaire email réutilise le composant partagé AuthForm : rendu
 * strictement identique aux autres pages de connexion (CA, back-office).
 */
export default function CaisseLogin({ logoUrl, brandName }: { logoUrl: string; brandName: string }) {
  const [mode, setMode] = useState<'email' | 'pin' | 'loading'>('loading');
  // Première connexion sur cet appareil (aucune boutique rattachée) : on propose
  // de créer une caisse. Pas affiché si l'utilisateur bascule manuellement vers
  // l'email depuis l'écran PIN (dans ce cas la boutique existe déjà).
  const [firstTime, setFirstTime] = useState(false);

  // Décide du mode initial : PIN si la boutique est déjà rattachée à ce
  // poste (des utilisateurs remontent), sinon email (première connexion).
  useEffect(() => {
    void (async () => {
      try {
        let q = '';
        if (typeof window !== 'undefined') {
          const dev = readDeviceId();
          if (dev) q = `?device_id=${encodeURIComponent(dev)}`;
        }
        const r = await fetch(`/api/users/select${q}`);
        const j = r.ok ? await r.json() : {};
        if (!j.tenant_required && Array.isArray(j.users) && j.users.length > 0) {
          setMode('pin');
        } else {
          setFirstTime(true);
          setMode('email');
        }
      } catch {
        setFirstTime(true);
        setMode('email');
      }
    })();
  }, []);

  if (mode === 'loading') {
    return <main className="min-h-screen grid place-items-center bg-gray-50 text-sm text-ink-soft">Chargement…</main>;
  }

  if (mode === 'pin') {
    // Le bouton « Connexion par email » fait partie du design de l'écran PIN
    // (cadre or sur le fond vert) : on le passe à PinLogin plutôt que de le
    // superposer.
    return <PinLogin onEmailLogin={() => setMode('email')} />;
  }

  return (
    <AuthForm
      logoUrl={logoUrl}
      brandName={brandName}
      title="Connexion à la caisse"
      subtitle="Connectez-vous avec votre email et votre mot de passe."
      submitLabel="Se connecter"
      redirectTo="/caisse"
      footer={
        <div className="w-full flex flex-col items-center gap-3">
          {firstTime && (
            <div className="w-full">
              <a
                href={setupUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl accent-bar text-white px-4 py-2.5 text-sm font-semibold"
              >
                Créer ma caisse
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
              <p className="mt-1.5 text-center text-xs text-ink-soft">
                Première utilisation ? Créez votre boutique en quelques minutes.
              </p>
            </div>
          )}
          <button onClick={() => setMode('pin')} className="underline hover:text-ink">
            Connexion par code PIN
          </button>
        </div>
      }
    />
  );
}
