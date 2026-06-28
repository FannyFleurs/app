'use client';

import { useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import type { CartLine, PosProduct } from './CashRegister';
import type { PickedCustomer } from './CustomerPickerModal';

export interface DeliveryIntent {
  pickup_or_delivery: 'pickup' | 'delivery';
  requested_at: string;
  slot_label: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: { line1: string; zip: string; city: string } | null;
  internal_notes?: string;
}

interface Props {
  lines: CartLine[];
  customer: PickedCustomer | null;
  totalTtc: number;
  storeId: string;
  saleId: string | null;
  deliveryProduct?: PosProduct;
  onClose: () => void;
  onSaved: () => void;
  /** Encaisser maintenant : on attache les infos de delivery à la vente
   *  et on déclenche le flow paiement classique côté parent. */
  onPayNow: (intent: DeliveryIntent) => void;
}

/**
 * Création d'une commande en différé (retrait ou livraison à date).
 * - Le panier en cours est utilisé comme contenu de la commande.
 * - L'utilisateur choisit le type : "Retrait" (par défaut) ou "Livraison"
 *   (auto-détecté si une ligne "Livraison" est présente au panier).
 * - Date + créneau de retrait/livraison obligatoires.
 * - Une fois validée, la commande apparaît sur /orders.
 */
export default function OrderModal({
  lines, customer, totalTtc, storeId, saleId, deliveryProduct, onClose, onSaved, onPayNow,
}: Props) {
  // Auto-détection : si une ligne "Livraison" est au panier → mode delivery
  const hasDeliveryLine = lines.some(
    (l) => /livraison|delivery/i.test(l.label),
  );
  const [type, setType] = useState<'pickup' | 'delivery'>(
    hasDeliveryLine ? 'delivery' : 'pickup',
  );
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('10:00');
  const [recipientName, setRecipientName] = useState(customer?.display_name ?? '');
  const [recipientPhone, setRecipientPhone] = useState(customer?.phone ?? '');
  const [addrLine1, setAddrLine1] = useState('');
  const [addrZip, setAddrZip] = useState('');
  const [addrCity, setAddrCity] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMode, setPaymentMode] = useState<'pay_now' | 'payment_link'>('pay_now');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentLinkSent, setPaymentLinkSent] = useState<string | null>(null);

  async function submit() {
    if (!date || !time) { setError('Date et heure obligatoires.'); return; }
    if (type === 'delivery' && !addrLine1.trim()) {
      setError('Adresse de livraison obligatoire.'); return;
    }
    setSaving(true); setError(null);

    const requested_at = new Date(`${date}T${time}:00`).toISOString();
    const slot_label = `${date} · ${time}`;
    const recipient_name = recipientName.trim() || undefined;
    const recipient_phone = recipientPhone.trim() || undefined;
    const delivery_address = type === 'delivery'
      ? { line1: addrLine1.trim(), zip: addrZip.trim(), city: addrCity.trim() }
      : undefined;
    const internal_notes = notes.trim() || undefined;

    // === MODE "Encaisser maintenant" =====================================
    // Pas de POST /api/orders. On attache juste les infos de delivery à
    // la vente en cours, puis on délègue au parent qui ouvre PaymentModal.
    if (paymentMode === 'pay_now') {
      if (!saleId) {
        setSaving(false);
        setError('Aucune vente en cours.');
        return;
      }
      const intent: DeliveryIntent = {
        pickup_or_delivery: type,
        requested_at,
        slot_label,
        recipient_name,
        recipient_phone,
        delivery_address: delivery_address ?? null,
        internal_notes,
      };
      // Persiste l'intent côté serveur (silencieux si migration 0019 absente)
      try {
        await fetch(`/api/sales/${saleId}/delivery`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(intent),
        });
      } catch { /* on continue même si ça échoue */ }
      setSaving(false);
      onPayNow(intent);
      return;
    }

    // === MODES "À régler au retrait" / "Lien de paiement" ================
    const body = {
      store_id: storeId,
      customer_id: customer?.id ?? null,
      pickup_or_delivery: type,
      requested_at,
      slot_label,
      recipient_name,
      recipient_phone,
      delivery_address,
      internal_notes,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        label: l.label,
        quantity: l.quantity,
        unit_price_ttc: l.unit_price_ttc,
        tax_rate: l.tax_rate,
        tax_rate_code: l.tax_rate_code,
      })),
    };
    const r = await fetch('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      setSaving(false);
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const orderRes = await r.json();

    // Si lien de paiement choisi → crée la session Stripe et l'envoie au client
    if (paymentMode === 'payment_link') {
      const linkRes = await fetch(`/api/orders/${orderRes.id}/payment-link`, {
        method: 'POST',
      });
      if (!linkRes.ok) {
        setSaving(false);
        const j = await linkRes.json().catch(() => ({}));
        setError(j.message ?? j.error ?? 'Stripe non configuré.');
        return;
      }
      const j = await linkRes.json();
      if (j.email_sent_to) {
        setPaymentLinkSent(j.email_sent_to);
      } else {
        setPaymentLinkSent(j.url);
      }
      setSaving(false);
      // On laisse la modale ouverte pour montrer la confirmation
      return;
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-lg w-full p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Nouvelle commande</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setType('pickup')}
            className={`rounded-xl py-2.5 text-sm font-semibold border ${
              type === 'pickup' ? 'accent-bar text-white border-transparent' : 'bg-white border-border text-ink'
            }`}
          >📦 Retrait boutique</button>
          <button
            onClick={() => setType('delivery')}
            className={`rounded-xl py-2.5 text-sm font-semibold border ${
              type === 'delivery' ? 'accent-bar text-white border-transparent' : 'bg-white border-border text-ink'
            }`}
          >🚚 Livraison</button>
        </div>

        {type === 'delivery' && !hasDeliveryLine && deliveryProduct && (
          <p className="mb-3 text-xs text-warning">
            ⚠ Aucune ligne « Livraison » n&apos;est dans le panier — pensez à
            l&apos;ajouter avant de valider la commande.
          </p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Date de ${type === 'pickup' ? 'retrait' : 'livraison'} *`}>
              <input type="date" className="input" min={today} value={date}
                     onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Heure *">
              <input type="time" className="input" value={time}
                     onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>

          <Field label="Destinataire (nom)">
            <input className="input" value={recipientName}
                   onChange={(e) => setRecipientName(e.target.value)}
                   placeholder={customer?.display_name ?? 'Nom du destinataire'} />
          </Field>
          <Field label="Destinataire (téléphone)">
            <input className="input" value={recipientPhone}
                   onChange={(e) => setRecipientPhone(e.target.value)} />
          </Field>

          {type === 'delivery' && (
            <>
              <Field label="Adresse de livraison *">
                <input className="input" value={addrLine1}
                       onChange={(e) => setAddrLine1(e.target.value)}
                       placeholder="N°, rue" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="CP">
                  <input className="input" value={addrZip}
                         onChange={(e) => setAddrZip(e.target.value)} />
                </Field>
                <Field label="Ville" colSpan={2}>
                  <input className="input" value={addrCity}
                         onChange={(e) => setAddrCity(e.target.value)} />
                </Field>
              </div>
            </>
          )}

          <Field label="Notes internes">
            <textarea className="input h-16" value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Couleur de bouquet, message carte, etc." />
          </Field>

          <div className="rounded-xl bg-gray-50 p-3 flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">{lines.length} article(s)</span>
            <span className="text-xl font-semibold">{formatEUR(totalTtc)}</span>
          </div>

          {/* Mode de règlement */}
          <Field label="Règlement">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMode('pay_now')}
                className={`rounded-xl border py-2.5 text-sm font-semibold ${
                  paymentMode === 'pay_now'
                    ? 'accent-bar text-white border-transparent'
                    : 'bg-white border-border text-ink'
                }`}
              >
                Encaissement standard
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('payment_link')}
                className={`rounded-xl border py-2.5 text-sm font-semibold ${
                  paymentMode === 'payment_link'
                    ? 'accent-bar text-white border-transparent'
                    : 'bg-white border-border text-ink'
                }`}
                disabled={!customer?.email}
                title={!customer?.email ? 'Le client doit avoir un email enregistré.' : ''}
              >
                Lien Stripe
              </button>
            </div>
            {paymentMode === 'pay_now' && (
              <p className="mt-2 text-xs text-ink-soft">
                Modale de règlement standard (espèces / CB / chèque / carte cadeau / avoir /
                <strong> En compte</strong> si le client paye au retrait ou à la livraison).
                Le ticket portera la mention <strong>{type === 'pickup' ? 'RETRAIT' : 'LIVRAISON'}</strong>
                {' '}avec la date prévue.
              </p>
            )}
            {paymentMode === 'payment_link' && (
              <p className="mt-2 text-xs text-ink-soft">
                Un lien sécurisé Stripe sera envoyé à <strong>{customer?.email}</strong>.
                Dès paiement, la commande passera en « payée » automatiquement.
              </p>
            )}
            {paymentMode === 'payment_link' && !customer?.email && (
              <p className="mt-2 text-xs text-danger">
                ⚠ Aucun email sur la fiche client. Modifiez-la ou choisissez un autre mode.
              </p>
            )}
          </Field>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {paymentLinkSent && (
          <div className="mt-3 rounded-xl bg-success/10 px-4 py-3 text-sm text-success">
            ✓ Lien de paiement envoyé à <strong>{paymentLinkSent}</strong>.
            <p className="mt-1 text-xs">
              Vous serez notifié dès que le client aura payé.
            </p>
            <button onClick={onSaved} className="btn-primary mt-3 text-sm h-9">
              Terminer
            </button>
          </div>
        )}

        {!paymentLinkSent && (
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button onClick={() => void submit()} disabled={saving} className="btn-primary">
              {saving
                ? '…'
                : paymentMode === 'pay_now'
                  ? 'Suite → Encaissement'
                  : 'Créer la commande'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="text-xs font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
