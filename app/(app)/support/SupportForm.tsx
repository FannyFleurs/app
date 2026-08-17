'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import { readDeviceId } from '@/lib/device';
import { posteRef } from '@/lib/poste-ref';
import {
  KIND_LABELS,
  SEVERITY_LABELS,
  TICKET_SEVERITIES,
  type TicketKind,
  type TicketSeverity,
} from '@/lib/support/tickets';
import { canCaptureScreen, captureScreen, compressImageFile } from '@/lib/support/screenshot';

/**
 * Formulaire d'une demande d'assistance.
 *
 * Trois questions seulement — la nature, le titre, le récit —, plus le niveau
 * quand c'est une panne. Le reste (écran, poste, navigateur) est relevé tout
 * seul : c'est précisément ce que le commerçant ne sait pas fournir et ce dont
 * le traitement a besoin.
 *
 * La capture d'écran est recommandée, jamais obligatoire : on ne bloque pas le
 * signalement d'une panne derrière une manipulation qui, elle aussi, peut
 * échouer.
 */
export default function SupportForm({
  appArea,
  onSent,
}: {
  appArea: 'caisse' | 'bo';
  onSent: () => void;
}) {
  const [kind, setKind] = useState<TicketKind>('incident');
  const [severity, setSeverity] = useState<TicketSeverity>('gene');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [shotError, setShotError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [poste, setPoste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [canCapture, setCanCapture] = useState(false);

  // Référence du poste : elle identifie l'appareil auprès du support. Absente
  // sur un back-office ouvert depuis un ordinateur, ce qui est normal.
  useEffect(() => {
    setCanCapture(canCaptureScreen());
    const dev = readDeviceId();
    if (!dev) return;
    void (async () => {
      try {
        const r = await fetch(`/api/registers/mine?device_id=${encodeURIComponent(dev)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (j.register) setPoste(posteRef(j.register.id));
      } catch {
        // Poste inconnu : la demande part sans référence d'appareil.
      }
    })();
  }, []);

  // Coller une capture (Ctrl+V) : le geste le plus court sur un ordinateur.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (!file || !file.type.startsWith('image/')) return;
      e.preventDefault();
      void useFile(file);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  async function useFile(file: File) {
    setShotError('');
    try {
      setShot(await compressImageFile(file));
    } catch {
      setShotError('Image illisible. Réessayez avec une autre capture.');
    }
  }

  async function onCapture() {
    setShotError('');
    setCapturing(true);
    try {
      setShot(await captureScreen());
    } catch (e) {
      // Refus du partage : ce n'est pas une erreur, c'est un choix.
      const name = e instanceof Error ? e.name : '';
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        setShotError('La capture n’a pas abouti. Joignez une image à la place.');
      }
    } finally {
      setCapturing(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) {
      setError('Indiquez en une ligne ce qui se passe.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const r = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          severity,
          subject: subject.trim(),
          body: body.trim(),
          screenshot: shot,
          page_path: window.location.pathname,
          app_area: appArea,
          poste_ref: poste,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(
          j.error === 'MIGRATION_MANQUANTE'
            ? 'L’assistance n’est pas encore active sur cette installation.'
            : (j.message as string) || 'Envoi impossible. Réessayez dans un instant.',
        );
        setSending(false);
        return;
      }
      setDone(true);
      setSubject('');
      setBody('');
      setShot(null);
      onSent();
    } catch {
      setError('Connexion interrompue. Vérifiez votre réseau et réessayez.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-success/10 text-success">
          <Icon name="check" size={22} />
        </div>
        <h2 className="text-base font-semibold">Demande envoyée</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Elle apparaît ci-dessous avec son état. Vous serez prévenu ici même dès
          qu’elle est traitée.
        </p>
        <button type="button" className="btn-soft mt-4" onClick={() => setDone(false)}>
          Envoyer une autre demande
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <fieldset>
        <legend className="text-sm font-medium mb-2">De quoi s’agit-il ?</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABELS) as TicketKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={kind === k ? 'btn-primary' : 'btn-ghost border border-border'}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>

      {kind === 'incident' ? (
        <fieldset>
          <legend className="text-sm font-medium mb-2">Est-ce que cela vous empêche de travailler ?</legend>
          <div className="space-y-1.5">
            {TICKET_SEVERITIES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="severity"
                  checked={severity === s}
                  onChange={() => setSeverity(s)}
                />
                {SEVERITY_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <label htmlFor="sujet" className="block text-sm font-medium mb-1">
          En une ligne
        </label>
        <input
          id="sujet"
          className="input"
          maxLength={160}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={kind === 'incident' ? 'Le ticket ne s’imprime plus' : 'Pouvoir dupliquer une commande'}
          required
        />
      </div>

      <div>
        <label htmlFor="recit" className="block text-sm font-medium mb-1">
          Ce que vous faisiez, ce qui s’est passé
        </label>
        <textarea
          id="recit"
          className="input min-h-[7rem]"
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Encaissement d’une vente en espèces, l’écran est resté bloqué sur « Paiement »."
        />
      </div>

      <div>
        <span className="block text-sm font-medium mb-1">
          Capture d’écran <span className="font-normal text-ink-soft">— recommandée</span>
        </span>
        <p className="text-[13px] text-ink-soft mb-2">
          Une image de l’écran vaut mieux qu’une description : on voit tout de suite
          l’état de la caisse au moment du problème.
        </p>
        {shot ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot}
              alt="Capture jointe à la demande"
              className="h-24 w-auto rounded-lg border border-border object-cover"
            />
            <button type="button" className="btn-ghost" onClick={() => setShot(null)}>
              Retirer
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {canCapture ? (
              <button type="button" className="btn-soft" onClick={onCapture} disabled={capturing}>
                <Icon name="camera" size={18} />
                {capturing ? 'Capture…' : 'Capturer l’écran'}
              </button>
            ) : null}
            <button type="button" className="btn-ghost border border-border" onClick={() => fileRef.current?.click()}>
              Joindre une image
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void useFile(f);
              }}
            />
          </div>
        )}
        {shotError ? <p className="mt-2 text-sm text-danger">{shotError}</p> : null}
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={sending}>
          {sending ? 'Envoi…' : 'Envoyer la demande'}
        </button>
        <span className="text-[13px] text-ink-soft">
          {poste
            ? `L’écran d’où vous écrivez et le poste ${poste} sont joints automatiquement.`
            : 'L’écran d’où vous écrivez est joint automatiquement.'}
        </span>
      </div>
    </form>
  );
}
