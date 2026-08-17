'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { KIND_LABELS, type TicketKind } from '@/lib/support/tickets';

interface Update {
  id: string;
  subject: string;
  kind: TicketKind;
  status: 'traite' | 'clos';
  resolution: string;
  page_path: string;
  resolved_at: string | null;
}

/** Sondage espacé : une réponse d'assistance n'est pas une commande à servir. */
const POLL_INTERVAL_MS = 120_000;

/**
 * Fenêtre annonçant qu'une demande d'assistance a été traitée.
 *
 * Elle s'ouvre en priorité sur l'écran d'où la demande est partie — c'est là
 * que le problème a été vu, et souvent là que le commerçant vérifiera que
 * c'est réglé. Si l'utilisateur travaille ailleurs, la fenêtre attend : elle
 * s'ouvrira à son prochain passage, ou au bout d'un tour de sondage sur
 * n'importe quel écran, pour ne pas retenir une réponse indéfiniment.
 *
 * Fermer la fenêtre vaut accusé de lecture : la demande passe en clôturée.
 */
export default function SupportNotifier() {
  const [pending, setPending] = useState<Update[]>([]);
  const [current, setCurrent] = useState<Update | null>(null);
  const [closing, setClosing] = useState(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch('/api/support/updates', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { tickets: Update[] };
      setPending(j.tickets ?? []);
    } catch {
      // Hors ligne : on retentera au prochain tour.
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // Choix de la réponse à présenter : d'abord celle qui concerne l'écran
  // affiché, sinon la plus ancienne (elle attend depuis le plus longtemps).
  useEffect(() => {
    if (current || pending.length === 0) return;
    const path = window.location.pathname;
    const here = pending.find((t) => t.page_path && t.page_path === path);
    setCurrent(here ?? pending[0] ?? null);
  }, [pending, current]);

  async function acknowledge() {
    if (!current) return;
    setClosing(true);
    try {
      await fetch(`/api/support/tickets/${current.id}/ack`, { method: 'POST' });
    } catch {
      // L'accusé repartira au prochain sondage : la fenêtre se rouvrira.
    } finally {
      setPending((list) => list.filter((t) => t.id !== current.id));
      setCurrent(null);
      setClosing(false);
    }
  }

  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center bg-ink/30 backdrop-blur-sm p-3 sm:p-6"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) void acknowledge(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hp-support-notif-title"
        className="card w-full max-w-lg p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <Icon name="check" size={20} />
          </span>
          <div className="min-w-0">
            <h2 id="hp-support-notif-title" className="text-base font-semibold">
              Votre demande a été traitée
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              {KIND_LABELS[current.kind]} · {current.subject}
            </p>
          </div>
        </div>

        {current.resolution ? (
          <div className="mt-4 rounded-xl bg-success/5 border border-success/20 p-3">
            <p className="whitespace-pre-wrap text-sm">{current.resolution}</p>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <a href="/support" className="btn-ghost">Voir mes demandes</a>
          <button type="button" className="btn-primary" onClick={acknowledge} disabled={closing}>
            {closing ? 'Fermeture…' : 'J’ai lu'}
          </button>
        </div>
      </div>
    </div>
  );
}
