'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  receipt: {
    id: string; number: string; saleId: string; customerId: string | null;
    loyalty?: { earned: number; redeemed: number; new_balance: number } | null;
  };
  onClose: () => void;
}

const AUTO_CLOSE_MS = 5000;

export default function ReceiptPreviewModal({ receipt, onClose }: Props) {
  const pdfUrl = `/api/receipts/${receipt.id}/pdf`;
  const [invoice, setInvoice] = useState<{ id: string; number: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailToast, setEmailToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [timeLeft, setTimeLeft] = useState(AUTO_CLOSE_MS);
  const timerRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  // Auto-fermeture après 5s. Pause si on ouvre un sous-modal ou survol.
  useEffect(() => {
    if (paused || showEmailModal) return;
    const start = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const left = AUTO_CLOSE_MS - elapsed;
      if (left <= 0) { onClose(); return; }
      setTimeLeft(left);
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [paused, showEmailModal, onClose]);

  // Click hors carte → ferme
  function onBackdropClick(e: React.MouseEvent) {
    if (!cardRef.current) return;
    if (!cardRef.current.contains(e.target as Node)) onClose();
  }

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
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4"
      onClick={onBackdropClick}
    >
      <div
        ref={cardRef}
        className="card max-w-2xl w-full p-6"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ticket {receipt.number}</h2>
            <p className="text-sm text-ink-soft">Vente validée et scellée fiscalement.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-soft tabular-nums">
              Fermeture auto dans {Math.ceil(timeLeft / 1000)}s
            </span>
            <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-primary">Imprimer / PDF</a>
          <button onClick={() => setShowEmailModal(true)} className="btn-soft">Envoyer par mail</button>
          <button onClick={onClose} className="btn-ghost">Nouvelle vente</button>
        </div>

        {emailToast && (
          <div className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            {emailToast}
          </div>
        )}

        {receipt.loyalty && (receipt.loyalty.earned > 0 || receipt.loyalty.redeemed > 0) && (
          <div className="mt-3 rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success flex items-center justify-between">
            <span>
              {receipt.loyalty.earned > 0 && <>✦ <strong>+{receipt.loyalty.earned} €</strong> de fidélité gagnés</>}
              {receipt.loyalty.earned > 0 && receipt.loyalty.redeemed > 0 && ' · '}
              {receipt.loyalty.redeemed > 0 && <><strong>-{receipt.loyalty.redeemed} €</strong> utilisés</>}
            </span>
            <span className="text-xs text-ink-soft">Nouveau solde : <strong>{receipt.loyalty.new_balance} €</strong></span>
          </div>
        )}

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
              Aucun client attaché. Pour facturer en B2B, sélectionnez un client avant l&apos;encaissement.
            </div>
          )}
          {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        </div>

        <div className="mt-4 h-[300px] rounded-xl border border-border overflow-hidden">
          <iframe src={pdfUrl} className="w-full h-full" title="Ticket" />
        </div>
      </div>

      {showEmailModal && (
        <EmailReceiptModal
          receiptId={receipt.id}
          customerId={receipt.customerId}
          onClose={() => setShowEmailModal(false)}
          onSent={(addr) => {
            setShowEmailModal(false);
            setEmailToast(`✓ Ticket envoyé à ${addr}`);
            setTimeout(() => setEmailToast(null), 3000);
          }}
        />
      )}
    </div>
  );
}

function EmailReceiptModal({ receiptId, customerId, onClose, onSent }: {
  receiptId: string;
  customerId: string | null;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    void (async () => {
      const r = await fetch(`/api/customers/${customerId}`);
      if (r.ok) {
        const j = await r.json();
        if (j.customer?.email) setEmail(j.customer.email);
      }
    })();
  }, [customerId]);

  async function send() {
    if (!email.trim()) { setError('Adresse email obligatoire.'); return; }
    setLoading(true); setError(null);
    const r = await fetch(`/api/receipts/${receiptId}/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    setLoading(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSent(email.trim());
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Envoyer par mail</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <label className="text-sm font-medium text-ink-soft">Adresse email du client</label>
        <input
          autoFocus
          type="email"
          className="input mt-1"
          placeholder="client@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
        />
        {!customerId && (
          <p className="mt-1 text-xs text-ink-soft">Aucun client n&apos;était attaché à la vente.</p>
        )}
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void send()} disabled={loading || !email.trim()} className="btn-primary">
            {loading ? 'Envoi…' : 'Envoyer'}
          </button>
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
