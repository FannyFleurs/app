'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KIND_LABELS,
  SEVERITY_SHORT,
  STATUS_LABELS,
  TICKET_STATUSES,
  isOpen,
  type SupportTicket,
  type TicketStatus,
} from '@/lib/support/tickets';

type Row = SupportTicket & { org_name: string | null };

const FILTERS: { key: string; label: string }[] = [
  { key: 'ouvertes', label: 'À traiter' },
  { key: 'traite', label: 'Traitées' },
  { key: 'clos', label: 'Clôturées' },
  { key: '', label: 'Toutes' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * File de traitement des demandes d'assistance.
 *
 * Une demande se traite sans quitter la liste : l'état, le commentaire destiné
 * au commerçant, la note interne. Le commentaire est obligatoire pour passer
 * en « traité » — c'est lui qui s'affichera sur l'écran du commerçant.
 */
export default function SupportTicketsClient({ initial }: { initial: Row[] }) {
  const [filter, setFilter] = useState('ouvertes');
  const [rows, setRows] = useState<Row[]>(initial);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/support-tickets${f ? `?status=${f}` : ''}`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        setRows(j.tickets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.key ? 'bg-ink text-white' : 'bg-gray-100 text-ink-soft hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
        {loading ? <span className="self-center text-sm text-ink-soft">Chargement…</span> : null}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft">Aucune demande dans cette vue.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <TicketCard
              key={t.id}
              t={t}
              open={openId === t.id}
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onSaved={(updated) => setRows((list) => list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketCard({
  t, open, onToggle, onSaved,
}: {
  t: Row;
  open: boolean;
  onToggle: () => void;
  onSaved: (t: Row) => void;
}) {
  const [status, setStatus] = useState<TicketStatus>(t.status);
  const [resolution, setResolution] = useState(t.resolution);
  const [note, setNote] = useState(t.admin_note);
  const [shot, setShot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (!open || !t.has_screenshot || shot) return;
    void (async () => {
      try {
        const r = await fetch(`/api/admin/support-tickets/${t.id}?screenshot=1`, { cache: 'no-store' });
        if (r.ok) setShot((await r.json()).screenshot ?? null);
      } catch {
        // Capture indisponible : le reste de la demande se traite quand même.
      }
    })();
  }, [open, t.has_screenshot, t.id, shot]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await fetch(`/api/admin/support-tickets/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution, admin_note: note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError((j.message as string) || 'Enregistrement impossible.');
        return;
      }
      onSaved({ ...t, ...(j.ticket as Row) });
      setSavedAt(Date.now());
    } catch {
      setError('Connexion interrompue.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-ink">
              {t.subject}
              {t.kind === 'incident' && t.severity === 'bloquant' ? (
                <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                  Bloquant
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm text-ink-soft">
              {t.org_name ?? 'Organisation inconnue'} · {KIND_LABELS[t.kind]}
              {t.kind === 'incident' ? ` · ${SEVERITY_SHORT[t.severity]}` : ''}
              {t.page_path ? ` · ${t.page_path}` : ''}
              {t.poste_ref ? ` · ${t.poste_ref}` : ''}
            </div>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isOpen(t.status) ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
              }`}
            >
              {STATUS_LABELS[t.status]}
            </span>
            <div className="mt-1 text-xs text-ink-soft whitespace-nowrap">{formatDate(t.created_at)}</div>
          </div>
        </div>
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="text-sm">
            <div className="text-ink-soft">
              {t.author_name}
              {t.author_email ? (
                <> · <a href={`mailto:${t.author_email}`} className="hover:underline">{t.author_email}</a></>
              ) : null}
            </div>
            {t.body ? <p className="mt-2 whitespace-pre-wrap">{t.body}</p> : null}
            {t.user_agent ? (
              <p className="mt-2 text-xs text-ink-soft break-all">{t.user_agent}</p>
            ) : null}
          </div>

          {t.has_screenshot ? (
            shot ? (
              <a href={shot} target="_blank" rel="noreferrer" title="Ouvrir en grand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot} alt="Capture envoyée par le commerçant" className="max-h-80 rounded-lg border border-border" />
              </a>
            ) : (
              <p className="text-sm text-ink-soft">Chargement de la capture…</p>
            )
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div>
              <label htmlFor={`st-${t.id}`} className="block text-sm font-medium mb-1">État</label>
              <select
                id={`st-${t.id}`}
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`res-${t.id}`} className="block text-sm font-medium mb-1">
                Réponse au commerçant <span className="font-normal text-ink-soft">— affichée sur son écran</span>
              </label>
              <textarea
                id={`res-${t.id}`}
                className="input min-h-[5rem]"
                maxLength={2000}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Corrigé dans la version de ce matin : le ticket s’imprime à nouveau après un rechargement de la caisse."
              />
            </div>
          </div>

          <div>
            <label htmlFor={`note-${t.id}`} className="block text-sm font-medium mb-1">
              Note interne <span className="font-normal text-ink-soft">— jamais montrée au commerçant</span>
            </label>
            <textarea
              id={`note-${t.id}`}
              className="input min-h-[3.5rem]"
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {savedAt ? <span className="text-sm text-success">Enregistré</span> : null}
            {t.acknowledged_at ? (
              <span className="text-sm text-ink-soft">Lu par le commerçant le {formatDate(t.acknowledged_at)}</span>
            ) : t.status === 'traite' ? (
              <span className="text-sm text-ink-soft">Réponse en attente de lecture</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
