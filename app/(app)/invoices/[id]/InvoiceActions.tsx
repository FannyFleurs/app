'use client';

import { useState } from 'react';
import SendInvoiceEmailModal from '@/components/SendInvoiceEmailModal';

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
        <SendInvoiceEmailModal
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
