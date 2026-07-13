'use client';

import { useState } from 'react';

interface Props {
  invoiceId: string;
  invoiceNumber: string | null;
  customerEmail: string | null;
  customerName: string | null;
}

export default function InvoiceActions({
  invoiceId, invoiceNumber, customerEmail, customerName,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendEmail(email?: string) {
    setBusy(true); setError(null);
    const r = await fetch(`/api/invoices/${invoiceId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { email } : {}),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    setSent(j.email);
    setShowEmailModal(false);
    setTimeout(() => setSent(null), 4000);
  }

  function onSendClick() {
    if (customerEmail) {
      // Envoi auto
      void sendEmail();
    } else {
      setShowEmailModal(true);
    }
  }

  return (
    <>
      <a
        href={`/api/invoices/${invoiceId}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="btn-soft"
      >
        🖨 Imprimer
      </a>
      <button
        onClick={onSendClick}
        disabled={busy}
        className="btn-primary"
      >
        {busy ? 'Envoi…' : '✉ Envoyer par email'}
      </button>
      {sent && (
        <div className="ml-3 inline-flex items-center text-sm text-success">
          ✓ Envoyée à {sent}
        </div>
      )}
      {error && (
        <div className="ml-3 inline-flex items-center text-sm text-danger">{error}</div>
      )}

      {showEmailModal && (
        <EmailModal
          invoiceNumber={invoiceNumber}
          customerName={customerName}
          onClose={() => setShowEmailModal(false)}
          onSend={sendEmail}
          busy={busy}
        />
      )}
    </>
  );
}

function EmailModal({ invoiceNumber, customerName, onClose, onSend, busy }: {
  invoiceNumber: string | null;
  customerName: string | null;
  onClose: () => void;
  onSend: (email: string) => Promise<void>;
  busy: boolean;
}) {
  const [email, setEmail] = useState('');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Envoyer la facture</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <p className="text-sm text-ink-soft mb-3">
          {customerName ? <>Aucune adresse email pour <strong className="text-ink">{customerName}</strong>. </> : ''}
          Renseignez une adresse pour envoyer la facture <strong className="text-ink">{invoiceNumber}</strong>.
        </p>
        <label className="text-sm font-medium text-ink-soft">Email du destinataire</label>
        <input
          type="email"
          autoFocus
          className="input mt-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="client@exemple.fr"
        />
        <p className="mt-2 text-xs text-ink-soft">
          L&apos;email sera enregistré sur la fiche client pour les prochains envois.
        </p>
        <button
          onClick={() => void onSend(email.trim())}
          disabled={busy || !email.includes('@')}
          className="btn-primary w-full mt-4 h-11"
        >
          {busy ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
