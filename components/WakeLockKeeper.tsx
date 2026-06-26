'use client';

import { useEffect, useRef } from 'react';

/**
 * Maintient l'écran allumé tant que l'app Webpos est active.
 *
 * Utilise l'API Screen Wake Lock (HTTPS requis, supportée Safari iOS 16.4+,
 * Chrome 84+). Si l'utilisateur change d'onglet ou met l'iPad en veille,
 * le verrou est automatiquement libéré ; on le réacquiert dès que la
 * page redevient visible.
 *
 * Sans effet sur les navigateurs qui ne supportent pas l'API (pas d'erreur).
 */
export default function WakeLockKeeper() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentinelRef = useRef<any>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wakeLock = (navigator as any).wakeLock;
    if (!wakeLock || typeof wakeLock.request !== 'function') return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await wakeLock.request('screen');
        if (cancelled) {
          await lock.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = lock;
        lock.addEventListener('release', () => {
          sentinelRef.current = null;
        });
      } catch {
        // ignore — permission refusée, page invisible, etc.
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel?.release) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, []);

  return null;
}
