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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!date || !time) { setError('Date et heure obligatoires.'); return; }
    if (type === 'delivery' && !addrLine1.trim()) {
      setError('Adresse de livraison obligatoire.'); return;
    }
    if (!saleId) { setError('Aucune vente en cours.'); return; }
    setSaving(true); setError(null);

    const requested_at = new Date(`${date}T${time}:00`).toISOString();
    const intent: DeliveryIntent = {
      pickup_or_delivery: type,
      requested_at,
      slot_label: `${date} · ${time}`,
      recipient_name: recipientName.trim() || undefined,
      recipient_phone: recipientPhone.trim() || undefined,
      delivery_address: type === 'delivery'
        ? { line1: addrLine1.trim(), zip: addrZip.trim(), city: addrCity.trim() }
        : null,
      internal_notes: notes.trim() || undefined,
    };
    // Persiste l'intent côté serveur (silencieux si migration 0019 absente)
    try {
      await fetch(`/api/sales/${saleId}/delivery`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent),
      });
    } catch { /* on continue même si ça échoue */ }
    setSaving(false);
    // Le règlement (espèces, CB, lien Stripe, En compte…) se fait sur
    // la modale de règlement classique côté parent.
    onPayNow(intent);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-lg w-full p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Nouvelle commande</h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            onClick={() => setType('pickup')}
            className={`rounded-xl h-14 text-base font-semibold border ${
              type === 'pickup' ? 'accent-bar text-white border-transparent' : 'bg-white border-border text-ink'
            }`}
          >📦 Retrait boutique</button>
          <button
            onClick={() => setType('delivery')}
            className={`rounded-xl h-14 text-base font-semibold border ${
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
              <input type="date" className="input h-12 text-base" min={today} value={date}
                     onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Heure *">
              <input type="time" className="input h-12 text-base" value={time}
                     onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>

          <Field label="Destinataire (nom)">
            <input className="input h-12 text-base" value={recipientName}
                   onChange={(e) => setRecipientName(e.target.value)}
                   placeholder={customer?.display_name ?? 'Nom du destinataire'} />
          </Field>
          <Field label="Destinataire (téléphone)">
            <input className="input h-12 text-base" value={recipientPhone}
                   onChange={(e) => setRecipientPhone(e.target.value)} />
          </Field>

          {type === 'delivery' && (
            <>
              <Field label="Adresse de livraison *">
                <input className="input h-12 text-base" value={addrLine1}
                       onChange={(e) => setAddrLine1(e.target.value)}
                       placeholder="N°, rue" />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="CP">
                  <input className="input h-12 text-base" value={addrZip}
                         onChange={(e) => setAddrZip(e.target.value)} />
                </Field>
                <Field label="Ville" colSpan={2}>
                  <input className="input h-12 text-base" value={addrCity}
                         onChange={(e) => setAddrCity(e.target.value)} />
                </Field>
              </div>
            </>
          )}

          <Field label="Notes internes">
            <textarea className="input h-20 text-base py-2" value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Détails, message carte, etc." />
          </Field>

          <div className="rounded-xl bg-gray-50 p-3 flex items-baseline justify-between">
            <span className="text-sm text-ink-soft">{lines.length} article(s)</span>
            <span className="text-xl font-semibold">{formatEUR(totalTtc)}</span>
          </div>

          <p className="text-xs text-ink-soft">
            Le règlement (espèces, CB, chèque, carte cadeau, avoir, En compte, lien Stripe…)
            se fait sur la modale d&apos;encaissement standard à l&apos;étape suivante. Le ticket
            portera la mention <strong>{type === 'pickup' ? 'RETRAIT' : 'LIVRAISON'}</strong>
            {' '}avec la date prévue.
          </p>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost h-12 text-base px-5">Annuler</button>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className="btn-primary h-12 text-base font-semibold px-6"
          >
            {saving ? '…' : 'Suite → Encaissement'}
          </button>
        </div>
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
