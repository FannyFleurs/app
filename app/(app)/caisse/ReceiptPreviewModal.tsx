'use client';

import { useState } from 'react';

interface Props {
  receipt: { id: string; number: string; saleId: string; customerId: string | null };
  onClose: () => void;
}

export default function ReceiptPreviewModal({ receipt, onClose }: Props) {
  const pdfUrl = `/api/receipts/${receipt.id}/pdf`;
  const [invoice, setInvoice] = useState<{ id: string; number: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateInvoice() {
    setGenerating(true); setError(null);
    const res = await fetch(`/api/sales/${receipt.saleId}/invoice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setGenerating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(prettyError(j.error));
      return;
    }
    const j = await res.json();
    setInvoice({ id: j.invoice_id, number: j.number });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4">
      <div className="card max-w-2xl w-full p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ticket {receipt.number}</h2>
            <p className="text-sm text-ink-soft">Vente validée et scellée fiscalement.</p>
          </div>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-primary">Imprimer / PDF</a>
          <a href={pdfUrl} download className="btn-soft">Télécharger</a>
          <button onClick={onClose} className="btn-ghost">Nouvelle vente</button>
        </div>

        {/* Bloc facture */}
        <div className="mt-4 rounded-xl border border-border p-4 bg-gray-50">
          {invoice ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-soft">Facture émise</div>
                <div className="font-medium">{invoice.number}</div>
              </div>
              <a
                href={`/api/invoices/${invoice.id}/pdf`}
                target="_blank" rel="noreferrer"
                className="btn-primary text-sm"
              >
                Ouvrir la facture
              </a>
            </div>
          ) : receipt.customerId ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Générer une facture pour ce client ?</div>
                <div className="text-xs text-ink-soft mt-0.5">
                  La facture sera numérotée, scellée, immuable.
                </div>
              </div>
              <button onClick={() => void generateInvoice()} disabled={generating} className="btn-soft text-sm">
                {generating ? 'Génération…' : 'Générer la facture'}
              </button>
            </div>
          ) : (
            <div className="text-sm text-ink-soft">
              Aucun client attaché à cette vente. Pour facturer en B2B, sélectionnez un client
              avant l&apos;encaissement.
            </div>
          )}
          {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        </div>

        <div className="mt-4 h-[380px] rounded-xl border border-border overflow-hidden">
          <iframe src={pdfUrl} className="w-full h-full" title="Ticket" />
        </div>
      </div>
    </div>
  );
}

function prettyError(code: string): string {
  switch (code) {
    case 'INVOICE_ALREADY_EXISTS': return 'Une facture existe déjà pour cette vente.';
    case 'CUSTOMER_REQUIRED': return 'Aucun client attaché à la vente.';
    case 'SALE_NOT_VALIDATED': return 'La vente n\'est pas validée.';
    case 'FORBIDDEN': return 'Vous n\'avez pas la permission de facturer.';
    default: return code ?? 'Erreur';
  }
}
