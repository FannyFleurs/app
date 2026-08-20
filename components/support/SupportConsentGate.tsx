'use client';

import { useCallback, useEffect, useState } from 'react';

interface Req { id: string; request_expires_at: string; access_expires_at: string | null }

/**
 * Côté BOUTIQUE : sonde les demandes de dépannage et affiche le popup de
 * consentement (Autoriser / Refuser). Réservé aux owner/manager. Quand un
 * accès est en cours, affiche un rappel discret avec « Mettre fin ».
 */
export default function SupportConsentGate({ role }: { role: string }) {
  const enabled = role === 'owner' || role === 'manager';
  const [pending, setPending] = useState<Req | null>(null);
  const [active, setActive] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/support-access/pending', { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      setPending(j.pending ?? null);
      setActive(j.active ?? null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, [enabled, poll]);

  if (!enabled) return null;

  async function respond(action: 'approve' | 'decline') {
    if (!pending) return;
    setBusy(true);
    try {
      await fetch(`/api/support-access/${pending.id}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      setPending(null);
      await poll();
    } finally { setBusy(false); }
  }

  async function endAccess() {
    if (!active) return;
    setBusy(true);
    try {
      await fetch(`/api/support-access/${active.id}/revoke`, { method: 'POST' });
      setActive(null);
      await poll();
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* Rappel discret quand un dépannage est en cours */}
      {active && !pending && (
        <div className="fixed bottom-3 inset-x-0 z-[9998] flex justify-center px-3">
          <div className="flex items-center gap-3 rounded-full bg-ink text-white text-xs px-4 py-2 shadow-lg">
            <span>Assistance HelloPos connectée à votre espace.</span>
            <button onClick={() => void endAccess()} disabled={busy}
                    className="rounded-full bg-white/15 px-3 py-0.5 font-semibold hover:bg-white/25 disabled:opacity-60">
              Mettre fin
            </button>
          </div>
        </div>
      )}

      {/* Popup de consentement */}
      {pending && (
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-black/50 p-4">
          <div className="card w-full max-w-md p-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl accent-bar text-white text-2xl">
              ?
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Demande de dépannage</h2>
            <p className="mt-2 text-sm text-ink-soft">
              L’assistance HelloPos demande un accès temporaire à votre espace pour vous
              dépanner (réglages, imprimantes, comptes). L’accès est limité dans le temps,
              tracé, et vous pouvez y mettre fin à tout moment.
            </p>
            <div className="mt-5 flex gap-2">
              <button onClick={() => void respond('decline')} disabled={busy}
                      className="btn-soft h-11 flex-1">
                Refuser
              </button>
              <button onClick={() => void respond('approve')} disabled={busy}
                      className="btn-primary h-11 flex-1">
                {busy ? '…' : 'Autoriser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
