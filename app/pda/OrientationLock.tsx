'use client';

import { useEffect } from 'react';

/**
 * Verrouille l'orientation du PDA en portrait. Fonctionne quand l'app est
 * installée en PWA / en plein écran (Android Chrome). Sur iOS, l'API n'est
 * pas supportée : c'est alors le manifest (orientation: portrait) qui gère
 * l'orientation lorsque l'app est ajoutée à l'écran d'accueil.
 */
export default function OrientationLock() {
  useEffect(() => {
    if (typeof screen === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const so = (screen as any).orientation;
    if (so && typeof so.lock === 'function') {
      // Rejette si non supporté / pas en plein écran : on ignore silencieusement.
      Promise.resolve(so.lock('portrait')).catch(() => { /* non supporté */ });
    }
  }, []);
  return null;
}
