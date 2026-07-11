'use client';

import { useEffect, useState } from 'react';
import PinLogin from './PinLogin';
import AuthForm from '@/components/AuthForm';
import { readDeviceId } from '@/lib/device';

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
          setMode('email');
        }
      } catch {
        setMode('email');
      }
    })();
  }, []);

  if (mode === 'loading') {
    return <main className="min-h-screen grid place-items-center bg-gray-50 text-sm text-ink-soft">Chargement…</main>;
  }

  if (mode === 'pin') {
    return (
      <div className="relative">
        <PinLogin />
        <button
          onClick={() => setMode('email')}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 text-sm text-ink-soft hover:text-ink underline"
        >
          Connexion par email
        </button>
      </div>
    );
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
        <button onClick={() => setMode('pin')} className="underline hover:text-ink">
          Connexion par code PIN
        </button>
      }
    />
  );
}
