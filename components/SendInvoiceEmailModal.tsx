'use client';

import { useState } from 'react';

/**
 * Demande une adresse email pour envoyer une facture qui n'en a pas sur la
 * fiche client — partagée entre la page détail facture (InvoiceActions) et
 * la liste « Envoyer » de Facturation (BillingManager).
 */
export default function SendInvoiceEmailModal({ invoiceNumber, customerName, onClose, onSend, busy }: {
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
