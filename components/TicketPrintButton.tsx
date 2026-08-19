'use client';

import { useState } from 'react';

/**
 * Bouton de réimpression directe sur l'imprimante ticket. POST vers `url`
 * (endpoint qui met en file un job CloudPRNT). Le PDF reste accessible en
 * repli, surtout si aucune imprimante ticket n'est configurée (statut 409).
 */
export default function TicketPrintButton({
  url, pdfUrl, size = 'sm',
}: {
  url: string;
  pdfUrl: string;
  size?: 'sm' | 'xs';
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'noprinter' | 'err'>('idle');
  const cls = size === 'xs' ? 'text-xs' : 'text-sm';

  async function print() {
    if (state === 'busy') return;
    setState('busy');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (r.ok) { setState('ok'); setTimeout(() => setState('idle'), 2500); }
      else if (r.status === 409) setState('noprinter');
      else setState('err');
    } catch {
      setState('err');
    }
  }

  const label =
    state === 'busy' ? 'Impression…'
    : state === 'ok' ? '✓ Envoyé'
    : 'Imprimer';
  const title =
    state === 'noprinter' ? 'Aucune imprimante ticket configurée — utilisez le PDF.'
    : state === 'err' ? "L'impression a échoué — utilisez le PDF."
    : "Imprimer sur l'imprimante ticket";

  return (
    <span className="inline-flex items-center gap-2 justify-end whitespace-nowrap">
      <button
        type="button"
        onClick={() => void print()}
        disabled={state === 'busy'}
        className={`btn-soft ${cls}`}
        title={title}
      >
        {label}
      </button>
      <a
        href={pdfUrl}
        target="_blank"
        rel="noreferrer"
        className={`${cls} hover:underline ${state === 'noprinter' || state === 'err' ? 'text-danger font-medium' : 'text-ink-soft'}`}
        title="Ouvrir le PDF"
      >
        PDF
      </a>
    </span>
  );
}
