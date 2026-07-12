'use client';

import { useEffect, useState, useCallback } from 'react';
import { queuedCount, onQueueChange } from '@/lib/offline/queue';
import { syncOfflineSales, offlinePosEnabled } from '@/lib/offline/sync';

/**
 * Bandeau d'état réseau de la caisse. Visible seulement en mode hors-ligne
 * activé, et uniquement quand c'est utile (hors-ligne OU ventes en attente
 * de synchronisation). Déclenche la synchro à la reprise réseau.
 */
export default function OfflineBanner() {
  const enabled = offlinePosEnabled();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => { void queuedCount().then(setPending); }, []);

  const doSync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try { await syncOfflineSales(); } finally { setSyncing(false); refresh(); }
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    setOnline(navigator.onLine);
    refresh();
    const off = onQueueChange(refresh);
    const onOnline = () => { setOnline(true); void doSync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Filet : retente périodiquement s'il reste des ventes en attente.
    const iv = window.setInterval(() => { if (navigator.onLine) void doSync(); }, 30_000);
    void doSync();
    return () => {
      off();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(iv);
    };
  }, [enabled, refresh, doSync]);

  if (!enabled) return null;
  if (online && pending === 0) return null;

  const offlineTone = !online;
  return (
    <div
      className={`shrink-0 px-4 py-1.5 text-sm flex items-center justify-center gap-3 ${
        offlineTone ? 'bg-warning/15 text-warning' : 'bg-accent-soft text-accent-deep'
      }`}
    >
      <span className="font-medium">
        {offlineTone
          ? '⚠ Hors-ligne — les ventes sont enregistrées et seront synchronisées à la reprise'
          : `${pending} vente(s) en attente de synchronisation`}
      </span>
      {online && pending > 0 && (
        <button
          onClick={() => void doSync()}
          disabled={syncing}
          className="underline hover:no-underline disabled:opacity-50"
        >
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
      )}
    </div>
  );
}
