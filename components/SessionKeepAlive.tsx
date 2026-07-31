'use client';

import { useEffect } from 'react';

/**
 * Maintient la session active tant que l'appareil est ouvert (renouvellement
 * glissant). Ping /api/auth/refresh au chargement, au retour de l'onglet au
 * premier plan, et toutes les 30 min. Combiné à une durée de session longue,
 * un appareil déjà connecté le reste en continu.
 *
 * Silencieux par nature : en cas d'échec (hors-ligne, session révoquée) on
 * n'interrompt pas l'utilisateur — la prochaine navigation gérée par les
 * guards fera foi.
 */
export default function SessionKeepAlive() {
  useEffect(() => {
    const ping = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void fetch('/api/auth/refresh', { method: 'POST', keepalive: true }).catch(() => {});
    };
    ping();
    const iv = window.setInterval(ping, 30 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) ping(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return null;
}
