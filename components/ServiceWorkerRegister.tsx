'use client';

import { useEffect } from 'react';

/**
 * Enregistre le service worker de résilience hors-ligne — activé PAR DÉFAUT
 * (comme offlinePosEnabled). Désactivable avec NEXT_PUBLIC_OFFLINE_POS='0' :
 * dans ce cas on désenregistre proprement tout SW existant et on vide ses
 * caches, remettant l'app dans un état 100 % « en ligne » sans SW collant.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const enabled = process.env.NEXT_PUBLIC_OFFLINE_POS !== '0';

    if (enabled) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
    } else {
      // Nettoyage si l'option a été désactivée après coup.
      void (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith('webpos-')).map((k) => caches.delete(k)));
          }
        } catch { /* ignore */ }
      })();
    }
  }, []);

  return null;
}
