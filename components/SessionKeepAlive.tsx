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
    let last = 0;
    // Ping au plus une fois par minute (activité + intervalle partagent ce throttle).
    const ping = (force = false) => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = Date.now();
      if (!force && now - last < 60 * 1000) return;
      last = now;
      void fetch('/api/auth/refresh', { method: 'POST', keepalive: true }).catch(() => {});
    };
    ping(true);
    // Intervalle court (5 min) : bien en deçà de la durée de session, l'appareil
    // ouvert reste connecté en continu.
    const iv = window.setInterval(() => ping(true), 5 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) ping(true); };
    const onActivity = () => ping(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // L'activité utilisateur prolonge la session (throttlée à 1/min).
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, []);
  return null;
}
