'use client';

import { useCallback, useEffect, useState } from 'react';
import SupportForm from './SupportForm';
import {
  KIND_LABELS,
  STATUS_HINTS,
  STATUS_LABELS,
  isOpen,
  type SupportTicket,
} from '@/lib/support/tickets';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusChip({ t }: { t: SupportTicket }) {
  const tone = isOpen(t.status)
    ? 'bg-warning/10 text-warning'
    : 'bg-success/10 text-success';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[t.status]}
    </span>
  );
}

/**
 * Page « Assistance » du commerçant : le formulaire, puis l'historique de ses
 * demandes avec leur état et, une fois traitées, la réponse.
 *
 * L'historique porte toute la boutique, pas seulement l'utilisateur connecté :
 * quand la caisse est tenue à plusieurs, chacun doit voir que la panne a déjà
 * été signalée plutôt que de la signaler une deuxième fois.
 */
export default function SupportClient({ appArea }: { appArea: 'caisse' | 'bo' }) {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/support/tickets', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setTickets(j.tickets ?? []);
      }
    } catch {
      // Hors ligne : l'historique reste celui du dernier chargement.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      <SupportForm appArea={appArea} onSent={load} />

      <section>
        <h2 className="text-sm font-semibold mb-2">Vos demandes</h2>
        {loading ? (
          <p className="text-sm text-ink-soft">Chargement…</p>
        ) : tickets.length === 0 ? (
          <div className="card p-6 text-sm text-ink-soft">
            Aucune demande envoyée pour le moment.
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{t.subject}</div>
                    <div className="mt-0.5 text-[13px] text-ink-soft">
                      {KIND_LABELS[t.kind]}
                      {t.page_path ? ` · ${t.page_path}` : ''}
                      {t.poste_ref ? ` · ${t.poste_ref}` : ''}
                      {' · '}
                      {formatDate(t.created_at)}
                      {t.author_name ? ` · ${t.author_name}` : ''}
                    </div>
                  </div>
                  <StatusChip t={t} />
                </div>

                {t.body ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{t.body}</p>
                ) : null}

                {t.resolution ? (
                  <div className="mt-3 rounded-xl bg-success/5 border border-success/20 p-3">
                    <div className="text-xs font-semibold text-success">Réponse</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{t.resolution}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-[13px] text-ink-soft">{STATUS_HINTS[t.status]}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
