'use client';

import { useEffect } from 'react';

/**
 * Verrouille l'orientation du PDA en portrait.
 *
 * Monté dans le gabarit `/pda`, il couvre donc TOUS les écrans du PDA, y
 * compris l'appairage — pas seulement l'application une fois connectée.
 *
 * Android n'accorde le verrouillage qu'en mode plein écran / PWA installée,
 * et le relâche lorsque l'application passe en arrière-plan : on le
 * ré-applique donc à chaque retour au premier plan. iOS ne supporte pas
 * l'API ; c'est alors le manifeste (`orientation: portrait-primary`) qui
 * fait foi une fois l'application ajoutée à l'écran d'accueil.
 */
export default function OrientationLock() {
  useEffect(() => {
    if (typeof screen === 'undefined') return;

    const lockPortrait = () => {
      const so = (screen as Screen & {
        orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> };
      }).orientation;
      if (!so || typeof so.lock !== 'function') return;
      // Rejette si non supporté ou hors plein écran : sans conséquence.
      Promise.resolve(so.lock('portrait-primary')).catch(() => { /* non supporté */ });
    };

    lockPortrait();

    const onVisibility = () => { if (!document.hidden) lockPortrait(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return null;
}
