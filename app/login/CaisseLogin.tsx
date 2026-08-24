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

// Couleurs de marque (le logo : carré jaune pâle + sourire vert foncé).
const GREEN = '#16412C';       // titres, icônes vertes
const GREEN_CARD = '#2E6A59';  // fond de la carte « Créer ma caisse »
const YELLOW = '#FFEFB3';      // accents (logo, bouton, pastilles)

/**
 * Écran de connexion caisse.
 *
 * - PREMIÈRE utilisation d'un appareil (aucune boutique rattachée) : on affiche
 *   un écran d'accueil « Bienvenue » avec deux choix — créer une caisse (ouvre
 *   /setup en navigateur externe, hors de l'app) ou se connecter à un compte
 *   existant.
 * - Ensuite, la connexion se fait par PIN (boutique déjà connue) ou par email.
 */
export default function CaisseLogin({ logoUrl, brandName }: { logoUrl: string; brandName: string }) {
  const [mode, setMode] = useState<'loading' | 'welcome' | 'email' | 'pin'>('loading');

  useEffect(() => {
    // Aide au test : /login?new=1 force l'écran d'accueil « première visite »,
    // même sur une instance mono-organisation.
    if (typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('new') === '1') {
      setMode('welcome');
      return;
    }
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
          // Aucune boutique rattachée à cet appareil : accueil première visite.
          setMode('welcome');
        }
      } catch {
        setMode('welcome');
      }
    })();
  }, []);

  if (mode === 'loading') {
    return <main className="min-h-screen grid place-items-center bg-bg text-sm text-ink-soft">Chargement…</main>;
  }

  if (mode === 'pin') {
    return <PinLogin onEmailLogin={() => setMode('email')} />;
  }

  if (mode === 'email') {
    return (
      <AuthForm
        logoUrl={logoUrl}
        brandName={brandName}
        title="Connexion à la caisse"
        subtitle="Connectez-vous avec votre email et votre mot de passe."
        submitLabel="Se connecter"
        redirectTo="/caisse"
        footer={
          <button onClick={() => setMode('welcome')} className="underline hover:text-ink">
            ← Retour
          </button>
        }
      />
    );
  }

  // -------- Accueil première visite --------
  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Logo de l'app (réglage de marque). Repli sur la marque HelloPos si absent. */}
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={brandName || 'HelloPos'} className="h-20 w-auto object-contain" />
        ) : (
          <div className="h-20 w-20 rounded-3xl grid place-items-center" style={{ background: YELLOW }} aria-hidden="true">
            <svg width="46" height="46" viewBox="0 0 40 40"><path d="M11 21a9 9 0 0 0 18 0" fill="none" stroke={GREEN} strokeWidth="3.6" strokeLinecap="round" /></svg>
          </div>
        )}
        <h1 className="mt-5 text-3xl font-bold" style={{ color: GREEN }}>Bienvenue sur {brandName || 'HelloPos'}</h1>
        <p className="mt-2 text-ink-soft">Votre caisse simple, rapide et adaptée à votre boutique.</p>

        {/* Carte « Créer ma caisse » */}
        <div className="mt-8 w-full rounded-3xl p-6 text-white shadow-sm" style={{ background: GREEN_CARD }}>
          <div className="mx-auto h-16 w-16 rounded-full grid place-items-center" style={{ background: YELLOW }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8">
              <path d="M4 9h16l-1-4H5L4 9z" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M9 20v-5h6v5" />
            </svg>
          </div>
          <div className="mt-4 text-2xl font-bold">Créer ma caisse</div>
          <p className="mt-2 text-sm text-white/85">Première utilisation ? Créez votre boutique et commencez à encaisser en quelques minutes.</p>
          <a
            href={setupUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-semibold"
            style={{ background: YELLOW, color: GREEN }}
          >
            Commencer maintenant
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        </div>

        {/* Carte « Me connecter » */}
        <div className="mt-4 w-full rounded-3xl p-6 bg-surface border border-border shadow-sm">
          <div className="mx-auto h-16 w-16 rounded-full grid place-items-center" style={{ background: '#E7EFE9' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="1.8"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
          </div>
          <div className="mt-4 text-2xl font-bold" style={{ color: GREEN }}>Me connecter</div>
          <p className="mt-2 text-sm text-ink-soft">J&apos;ai déjà une caisse {brandName || 'HelloPos'}, je me connecte à mon compte.</p>
          <button
            onClick={() => setMode('email')}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3.5 text-base font-semibold"
            style={{ color: GREEN, borderColor: GREEN }}
          >
            Se connecter
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-2 text-xs text-ink-soft">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2l7 3v6c0 4.5-3 8.3-7 9-4-.7-7-4.5-7-9V5z" /><path d="M9 12l2 2 4-4" /></svg>
          Données sécurisées et hébergées en France
        </div>
      </div>
    </main>
  );
}
