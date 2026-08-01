'use client';

import { useEffect, useRef, useState } from 'react';
import { promptThemed } from '@/lib/ui/dialog';
import GiftReceiptPickerModal from '@/components/GiftReceiptPickerModal';
import { printReceipt } from '@/lib/pos/receipt-print';
import { formatEUR } from '@/lib/services/money';

interface Props {
  receipt: {
    id: string; number: string; saleId: string; customerId: string | null;
    loyalty?: { earned: number; redeemed: number; new_balance: number } | null;
    /** Rendu monnaie (espèces) — affiché s'il y en a. */
    change?: number;
  };
  /** Boutique du poste : sert à charger le paramétrage ticket de CETTE boutique. */
  storeId?: string;
  onClose: () => void;
}

export default function ReceiptPreviewModal({ receipt, storeId, onClose }: Props) {
  const isSchool = receipt.id.startsWith('school-receipt-');
  const pdfUrl = isSchool ? '' : `/api/receipts/${receipt.id}/pdf`;
  const [invoice, setInvoice] = useState<{ id: string; number: string } | null>(null);
  const [delivery, setDelivery] = useState<{
    pickup_or_delivery: 'pickup' | 'delivery';
    slot_label: string;
    recipient_name?: string;
    delivery_address?: { line1: string; zip: string; city: string } | null;
  } | null>(null);

  // Lignes de la vente (pour la sélection d'articles du ticket sans prix).
  // L'ordre correspond à celui du snapshot du ticket (tri par line_index),
  // donc la position i ici = la position i côté PDF.
  const [saleLines, setSaleLines] = useState<Array<{ label: string; quantity: string }>>([]);
  const [showGiftPicker, setShowGiftPicker] = useState(false);

  // Charge l'éventuel delivery_info + les lignes de la vente.
  useEffect(() => {
    if (isSchool || !receipt.saleId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/sales/${receipt.saleId}`);
        if (!r.ok) return;
        const j = await r.json();
        if (j.sale?.delivery_info) setDelivery(j.sale.delivery_info);
        if (Array.isArray(j.lines)) {
          setSaleLines(j.lines.map((l: { label: string; quantity: string }) => ({
            label: l.label, quantity: l.quantity,
          })));
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiBase = isSchool ? '' : `/api/receipts/${receipt.id}`;

  // Impression directe du ticket (imprimante CloudPRNT), repli PDF si aucune.
  async function printTicket() {
    if (isSchool) return;
    const res = await printReceipt({ base: apiBase, pdfUrl });
    setEmailToast(res.message);
    setTimeout(() => setEmailToast(null), 3000);
  }

  // Ticket sans prix : si un seul article, impression directe ; sinon on
  // ouvre le sélecteur d'articles.
  async function onGiftClick() {
    if (isSchool) return;
    if (saleLines.length <= 1) {
      const res = await printReceipt({ base: apiBase, pdfUrl, gift: true });
      setEmailToast(res.message);
      setTimeout(() => setEmailToast(null), 3000);
      return;
    }
    setShowGiftPicker(true);
  }
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailToast, setEmailToast] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const autoPrintFiredRef = useRef(false);

  // Auto-impression : si auto_print_receipt + printer.enabled, on ouvre
  // le PDF dans un onglet qui déclenche le dialogue d'impression natif
  // (compatible AirPrint sur iPad et imprimante par défaut sur Mac/PC).
  useEffect(() => {
    if (isSchool || autoPrintFiredRef.current) return;
    autoPrintFiredRef.current = true;
    void (async () => {
      try {
        const [rR, rP] = await Promise.all([
          fetch(`/api/settings/receipt${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
          fetch(`/api/settings/printer${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`),
        ]);
        if (!rR.ok || !rP.ok) return;
        const recv = (await rR.json()).settings;
        const printer = (await rP.json()).settings;
        if (recv?.auto_print_receipt && printer?.enabled) {
          // window.open en background tab puis print : sur mobile, l'utilisateur
          // confirmera dans le menu Partager → Imprimer.
          const w = window.open(pdfUrl, '_blank');
          if (w) {
            // Tentative d'impression auto au load. Échoue silencieusement
            // si le PDF est dans un onglet bloqué — au moins l'onglet est
            // ouvert et l'utilisateur peut imprimer en 1 geste.
            w.addEventListener('load', () => {
              try { w.print(); } catch { /* iOS bloque souvent print() */ }
            });
          }
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pas d'auto-fermeture : l'écran de validation reste affiché jusqu'à ce que
  // l'utilisateur ferme (clic « Nouvelle vente », ✕, ou clic en dehors).

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

  const [invoiceSending, setInvoiceSending] = useState(false);
  const [invoiceToast, setInvoiceToast] = useState<string | null>(null);

  async function sendInvoice(invoiceId: string, invoiceNumber: string, email?: string) {
    setInvoiceSending(true);
    try {
      const r = await fetch(`/api/invoices/${invoiceId}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {}),
      });
      if (!r.ok) {
        if (r.status === 400 || r.status === 422) {
          const entered = await promptThemed({
            title: 'Envoyer la facture',
            message: `Adresse email pour la facture ${invoiceNumber} :`,
            placeholder: 'client@exemple.fr',
          });
          if (entered && entered.includes('@')) { await sendInvoice(invoiceId, invoiceNumber, entered.trim()); }
          return;
        }
        setError('Envoi de la facture impossible.');
        return;
      }
      const j = await r.json();
      setInvoiceToast(`Facture envoyée à ${j.email}`);
    } finally {
      setInvoiceSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-2 md:p-4"
      onClick={() => { if (!showEmailModal && !showGiftPicker) onClose(); }}
    >
      <div
        ref={cardRef}
        className="card max-w-2xl w-full max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky avec bouton fermer toujours visible */}
        <div className="flex items-center justify-between p-4 md:p-6 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold truncate">Ticket {receipt.number}</h2>
            <p className="text-xs md:text-sm text-ink-soft">Vente validée et scellée fiscalement.</p>
          </div>
          <button
            onClick={onClose}
            className="grid place-items-center h-10 w-10 rounded-full border border-border text-ink-soft hover:text-ink hover:bg-gray-50 text-lg shrink-0"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-3">

        {/* Rendu monnaie (espèces) — bien visible en haut de l'écran. */}
        {receipt.change != null && receipt.change > 0 && (
          <div className="mt-1 rounded-xl bg-amber-100 border border-amber-300 px-4 py-3 flex items-center justify-between">
            <span className="text-base font-semibold text-amber-800">💶 Rendu monnaie</span>
            <span className="text-3xl font-bold text-amber-800 tabular-nums">{formatEUR(receipt.change)}</span>
          </div>
        )}

        {isSchool ? (
          <div className="mt-4 rounded-xl border border-warning bg-warning/10 p-4 text-center">
            <div className="font-medium text-warning">Ticket fictif — mode école</div>
            <p className="text-xs text-ink-soft mt-1">
              Aucune impression possible. La vente n&apos;est pas enregistrée.
            </p>
            <button onClick={onClose} className="btn-primary mt-3 h-14 px-6 text-base font-semibold">
              Nouvelle vente
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={() => void printTicket()}
              className="btn-primary h-12 sm:h-14 text-base font-semibold grid place-items-center text-center leading-tight"
            >
              Imprimer le ticket
            </button>
            <button
              onClick={onGiftClick}
              className="btn-soft h-12 sm:h-14 text-base font-semibold grid place-items-center text-center leading-tight"
              title="Imprimer un ticket sans prix (choix des articles si plusieurs)"
            >
              Ticket sans prix
            </button>
            <button
              onClick={() => setShowEmailModal(true)}
              className="btn-soft h-12 sm:h-14 text-base font-semibold grid place-items-center text-center leading-tight"
            >
              Envoyer par mail
            </button>
            <button
              onClick={onClose}
              className="btn-ghost h-12 sm:h-14 text-base font-semibold grid place-items-center text-center leading-tight"
            >
              Nouvelle vente
            </button>
          </div>
        )}

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

        <div className={`mt-4 rounded-xl border border-border p-4 bg-gray-50 ${isSchool ? 'hidden' : ''}`}>
          {invoice ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-soft">Facture émise</div>
                <div className="font-medium">{invoice.number}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void sendInvoice(invoice.id, invoice.number)}
                  disabled={invoiceSending}
                  className="btn-soft h-12 text-base px-5 inline-flex items-center disabled:opacity-40"
                >
                  {invoiceSending ? 'Envoi…' : '✉ Envoyer'}
                </button>
                <a
                  href={`/api/invoices/${invoice.id}/pdf`}
                  target="_blank" rel="noreferrer"
                  className="btn-primary h-12 text-base px-5 inline-flex items-center"
                >
                  Ouvrir la facture
                </a>
              </div>
              {invoiceToast && (
                <div className="w-full mt-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs text-success">
                  {invoiceToast}
                </div>
              )}
            </div>
          ) : receipt.customerId ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Générer une facture pour ce client ?</div>
                <div className="text-xs text-ink-soft mt-0.5">
                  La facture sera numérotée, scellée, immuable.
                </div>
              </div>
              <button
                onClick={() => void generateInvoice()}
                disabled={generating}
                className="btn-soft h-12 text-base px-5"
              >
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

        {delivery && (
          <div className="mt-4 rounded-xl border-2 border-accent-deep bg-accent-soft p-3">
            <div className="text-xs uppercase tracking-widest font-bold text-accent-deep">
              {delivery.pickup_or_delivery === 'pickup' ? '📦 RETRAIT BOUTIQUE' : '🚚 LIVRAISON'}
            </div>
            <div className="mt-1 text-sm">
              <strong>{delivery.slot_label}</strong>
            </div>
            {delivery.recipient_name && (
              <div className="text-xs text-ink-soft mt-0.5">
                Destinataire : {delivery.recipient_name}
              </div>
            )}
            {delivery.delivery_address && (
              <div className="text-xs text-ink-soft mt-0.5">
                {delivery.delivery_address.line1}
                {delivery.delivery_address.zip && `, ${delivery.delivery_address.zip}`}
                {delivery.delivery_address.city && ` ${delivery.delivery_address.city}`}
              </div>
            )}
          </div>
        )}

        {!isSchool && (
          <div className="mt-4 h-[300px] rounded-xl border border-border overflow-hidden">
            <iframe src={pdfUrl} className="w-full h-full" title="Ticket" />
          </div>
        )}
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

      {showGiftPicker && (
        <GiftReceiptPickerModal
          lines={saleLines}
          pdfBaseUrl={pdfUrl}
          onPrint={(indices) => void printReceipt({ base: apiBase, pdfUrl, gift: true, lines: indices })
            .then((res) => { setEmailToast(res.message); setTimeout(() => setEmailToast(null), 3000); })}
          onClose={() => setShowGiftPicker(false)}
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
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>
        <label className="text-sm font-medium text-ink-soft">Adresse email du client</label>
        <input
          autoFocus
          type="email"
          className="input mt-1 h-12 text-base"
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
          <button onClick={onClose} className="btn-ghost h-12 text-base px-5">Annuler</button>
          <button
            onClick={() => void send()}
            disabled={loading || !email.trim()}
            className="btn-primary h-12 text-base font-semibold px-6"
          >
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
