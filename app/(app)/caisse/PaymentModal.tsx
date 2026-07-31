'use client';
import { alertThemed } from '@/lib/ui/dialog';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';

type Method = 'cash' | 'card' | 'check' | 'transfer' | 'gift_card' | 'credit_note' | 'payment_link' | 'other' | 'deferred';

const FALLBACK_METHODS: Array<{ kind: Method; label: string }> = [
  { kind: 'cash', label: 'Espèces' },
  { kind: 'card', label: 'Carte bancaire' },
  { kind: 'check', label: 'Chèque' },
  { kind: 'transfer', label: 'Virement' },
  { kind: 'gift_card', label: 'Carte cadeau' },
  { kind: 'credit_note', label: 'Avoir' },
];

interface RegisteredPayment {
  key: string;
  method: Method;
  label: string;
  amount: number;            // montant alloué au ticket (toujours <= reste à payer)
  given_amount?: number;     // montant donné par le client (utile pour rendu monnaie espèces)
  reference?: string;        // numéro avoir / code carte cadeau
}

interface Props {
  saleId: string;
  totalTtc: number;
  /** Articles du ticket, affichés en colonne gauche de la page de règlement. */
  lines?: Array<{ label: string; quantity: number; unit_price_ttc: number; discount_amount: number }>;
  /** Boutique du poste : ne propose que les modes disponibles pour elle. */
  storeId?: string;
  /** Un client est-il rattaché à la vente ? Requis pour le paiement « en
   *  compte » (différé) : interdit sur une vente anonyme. */
  hasCustomer?: boolean;
  loyaltyRedemption?: number;
  /** Si true, on génère un faux ticket localement sans appel serveur. */
  schoolMode?: boolean;
  /** Mode hors-ligne disponible (flag). Si true et réseau coupé, on
   *  enregistre la vente en local au lieu d'appeler le serveur. */
  offlineEnabled?: boolean;
  onOfflineFinalize?: (
    payments: Array<{ method: 'cash'|'card'|'check'|'transfer'|'gift_card'|'credit_note'|'deferred'|'other'; amount: number; given_amount?: number; reference?: string }>,
    loyaltyUsed: number,
  ) => Promise<void>;
  onClose: () => void;
  onValidated: (receiptId: string, receiptNumber: string, loyalty?: { earned: number; redeemed: number; new_balance: number } | null) => void;
  /** Mode « règlement de solde en compte » : encaisse via l'écran classique
   *  mais valide un règlement de compte (pas une vente). */
  settlement?: { customerId: string };
  onSettled?: (result: { new_balance: number; total: number; settled_invoice_ids: string[] }) => void;
}

export default function PaymentModal({ saleId, totalTtc, lines = [], storeId, hasCustomer = false, loyaltyRedemption, schoolMode, offlineEnabled, onOfflineFinalize, onClose, onValidated, settlement, onSettled }: Props) {
  const [methods, setMethods] = useState<Array<{ kind: Method; label: string }>>(FALLBACK_METHODS);
  const [amountStr, setAmountStr] = useState<string>('');
  const [payments, setPayments] = useState<RegisteredPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupKind, setLookupKind] = useState<'credit_note' | 'gift_card' | null>(null);
  const [lookupLabel, setLookupLabel] = useState('');
  const [lookupAmountSeed, setLookupAmountSeed] = useState(0);

  // Saisie clavier physique
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lookupKind) return; // les sous-modaux gèrent leur propre clavier
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
      else if (e.key === '.' || e.key === ',') { press('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); }
      else if (e.key === 'Escape') { onClose(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKind]);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/payment-methods${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''}`);
      if (r.ok) {
        const j = await r.json();
        const active = (j.methods as Array<{ kind: Method; label: string; is_active: boolean }>)
          .filter((m) => m.is_active)
          // Règlement d'un compte : on ne peut pas régler « en compte » avec
          // « en compte », ni via lien de paiement (asynchrone).
          .filter((m) => !settlement || (m.kind !== 'deferred' && m.kind !== 'payment_link'));
        if (active.length > 0) setMethods(active.map((m) => ({ kind: m.kind, label: m.label })));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const paidAllocated = useMemo(
    () => round2(payments.reduce((s, p) => s + p.amount, 0)),
    [payments],
  );
  const remaining = round2(Math.max(0, totalTtc - paidAllocated));
  const totalGiven = useMemo(
    () => round2(payments.reduce((s, p) => s + (p.given_amount ?? p.amount), 0)),
    [payments],
  );
  const change = totalGiven > totalTtc ? round2(totalGiven - totalTtc) : 0;

  // Saisie clavier numérique : ajoute un chiffre / point / supprime
  function press(key: string) {
    setError(null);
    setAmountStr((cur) => {
      if (key === 'C') return '';
      if (key === '⌫') return cur.slice(0, -1);
      if (key === '.') {
        if (cur.includes('.') || cur.length === 0) return cur || '0.';
        return cur + '.';
      }
      // Chiffre
      if (cur === '0') return key;
      return cur + key;
    });
  }

  /**
   * Tap d'une méthode de paiement.
   * - Si rien tapé : on alloue tout le restant à cette méthode (montant exact).
   * - Si un montant tapé : on l'alloue à cette méthode.
   *   - Pour espèces avec montant > restant : on tolère un sur-paiement = rendu monnaie.
   *     Le montant alloué reste = restant, given_amount = saisie.
   *   - Pour les autres méthodes : on alloue min(saisie, restant).
   */
  async function tapMethod(m: { kind: Method; label: string }) {
    setError(null);
    const typed = Number(amountStr || '0');

    // Paiement « en compte » (différé) : impossible sur une vente anonyme —
    // il faut un client pour porter la créance.
    if (m.kind === 'deferred' && !hasCustomer) {
      setError('Le paiement « en compte » nécessite un client rattaché à la vente.');
      return;
    }

    // Avoir / Carte cadeau : on ouvre une recherche pour récupérer la référence + solde
    if (m.kind === 'credit_note' || m.kind === 'gift_card') {
      setLookupKind(m.kind);
      setLookupLabel(m.label);
      setLookupAmountSeed(typed);
      return;
    }

    let allocate: number;
    let given: number | undefined = undefined;

    if (typed === 0) {
      if (remaining <= 0) return;
      allocate = remaining;
    } else {
      const t = round2(typed);
      if (m.kind === 'cash' && t > remaining) {
        allocate = remaining;
        given = t;
      } else {
        allocate = Math.min(t, remaining);
      }
    }

    if (allocate <= 0) return;
    setPayments((cur) => [...cur, {
      key: cryptoKey(),
      method: m.kind,
      label: m.label,
      amount: allocate,
      given_amount: given,
    }]);
    setAmountStr('');
  }

  function removePayment(key: string) {
    setPayments((cur) => cur.filter((p) => p.key !== key));
  }

  function addReferencePayment(args: {
    method: 'credit_note' | 'gift_card';
    label: string;
    reference: string;
    amount: number;
    remainingOnRef: number;
  }) {
    const usable = Math.min(args.amount, args.remainingOnRef, remaining);
    if (usable <= 0) return;
    setPayments((cur) => [...cur, {
      key: cryptoKey(),
      method: args.method,
      label: `${args.label} ${args.reference.slice(-6)}`,
      amount: round2(usable),
      reference: args.reference,
    }]);
    setLookupKind(null);
    setAmountStr('');
  }

  async function validate() {
    if (Math.abs(paidAllocated - totalTtc) > 0.005) {
      setError('Le total payé doit être égal au total dû.');
      return;
    }
    // Règlement d'un solde « en compte » : on encaisse via l'écran classique
    // mais on valide un règlement de compte (pas une vente).
    if (settlement) {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/customers/${settlement.customerId}/settle-payment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payments: payments.map((p) => ({
              method: p.method, amount: p.amount, given_amount: p.given_amount, reference: p.reference,
            })),
            store_id: storeId,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.message ?? j.error ?? 'Échec du règlement.');
          return;
        }
        onSettled?.(await res.json());
      } finally { setLoading(false); }
      return;
    }
    // Mode école : on génère un faux ticket localement, pas d'appel
    // serveur, pas de hash chain fiscal, pas de débit de stock.
    if (schoolMode) {
      const fakeId = `school-receipt-${Date.now()}`;
      const fakeNumber = `ECOLE-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
      onValidated(fakeId, fakeNumber, null);
      return;
    }
    // Hors-ligne : on enregistre en local (scellement à la reprise réseau).
    if (offlineEnabled && onOfflineFinalize && typeof navigator !== 'undefined' && !navigator.onLine) {
      if (payments.some((p) => p.method === 'payment_link')) {
        setError('Le paiement en ligne (lien Stripe) est indisponible hors-ligne.');
        return;
      }
      setLoading(true); setError(null);
      try {
        await onOfflineFinalize(
          payments.map((p) => ({
            method: p.method as 'cash'|'card'|'check'|'transfer'|'gift_card'|'credit_note'|'deferred'|'other',
            amount: p.amount, given_amount: p.given_amount, reference: p.reference,
          })),
          loyaltyRedemption && loyaltyRedemption > 0 ? loyaltyRedemption : 0,
        );
      } finally { setLoading(false); }
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/sales/${saleId}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payments: payments.map((p) => ({
            method: p.method,
            amount: p.amount,
            given_amount: p.given_amount,
            reference: p.reference,
          })),
          loyalty_redemption_amount: loyaltyRedemption && loyaltyRedemption > 0 ? loyaltyRedemption : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const code = j.error ?? j.message;
        setError(
          code === 'CASH_SESSION_CLOSED' || code === 'NO_OPEN_CASH_SESSION'
            ? 'Journée clôturée : rouvrez la caisse (fonds de caisse) avant d\'encaisser.'
            : code ?? 'Erreur d\'encaissement',
        );
        return;
      }
      const j = await res.json();

      // Si l'utilisateur a inclus un règlement "payment_link", on déclenche
      // la création de la session Stripe et l'envoi au client par email.
      // Le webhook Stripe mettra à jour sales.payment_status='paid' à la
      // réception du paiement.
      const hasPaymentLink = payments.some((p) => p.method === 'payment_link');
      if (hasPaymentLink) {
        try {
          const linkRes = await fetch(`/api/sales/${saleId}/payment-link`, {
            method: 'POST',
          });
          if (linkRes.ok) {
            const lj = await linkRes.json();
            // Toast info au commerçant : lien créé (et email envoyé si client a un email)
            if (lj.email_sent_to) {
              void alertThemed({ message: `✓ Lien de paiement Stripe créé et envoyé à ${lj.email_sent_to}` });
            } else if (lj.url) {
              // Pas d'email : on copie l'URL pour que le commerçant la transmette manuellement
              try { await navigator.clipboard?.writeText(lj.url); } catch {}
              void alertThemed({ message: `Lien de paiement créé :\n\n${lj.url}\n\n(Copié dans le presse-papier — aucun email client renseigné.)` });
            }
          } else {
            const lj = await linkRes.json().catch(() => ({}));
            void alertThemed({ message: `Vente validée, mais création du lien Stripe impossible : ${lj.message ?? lj.error ?? 'erreur'}` });
          }
        } catch (e) {
          void alertThemed({ message: `Vente validée, mais le lien Stripe n'a pas pu être créé : ${(e as Error).message}` });
        }
      }

      onValidated(j.receipt_id, j.receipt_number, j.loyalty);
    } finally { setLoading(false); }
  }

  const canValidate = Math.abs(paidAllocated - totalTtc) < 0.005;

  return (
    // Page de règlement PLEIN ÉCRAN (et non plus une modale) : fond opaque
    // couvrant toute l'app, en-tête avec bouton retour, contenu centré.
    <div className="fixed inset-0 z-50 bg-bg flex flex-col pt-safe">
      <div className="w-full flex flex-col flex-1 overflow-hidden">
        {/* En-tête page : bouton retour caisse (bien visible, à gauche) + titre */}
        <div className="flex items-center gap-3 px-3 lg:px-5 h-14 border-b border-border shrink-0 bg-white">
          <button
            onClick={onClose}
            aria-label="Retour à la caisse"
            className="inline-flex items-center gap-1.5 rounded-xl accent-bar text-white px-3.5 h-9 text-sm font-semibold hover:opacity-90 active:scale-95 transition"
          >
            <span className="text-lg leading-none">←</span>
            Caisse
          </button>
          <h2 className="text-base lg:text-lg font-semibold">{settlement ? 'Règlement du compte' : 'Encaissement'}</h2>
        </div>

        {/* Contenu en 3 colonnes (comme la caisse), pleine largeur :
            gauche = articles du ticket · centre = à payer + pavé · droite = modes. */}
        <div className="w-full lg:grid lg:grid-cols-3 lg:gap-8 flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">

          {/* Colonne 1 : récap du ticket (articles) */}
          <div className="flex flex-col min-h-0">
            <div className="text-[10px] lg:text-xs uppercase tracking-wider text-ink-soft mb-1.5">
              Ticket · {lines.length} article{lines.length > 1 ? 's' : ''}
            </div>
            <div className="rounded-xl border border-border bg-white divide-y divide-border overflow-y-auto">
              {lines.length === 0 ? (
                <div className="px-3 py-4 text-sm text-ink-soft text-center">Aucun article</div>
              ) : lines.map((l, i) => {
                const lineTtc = round2(l.unit_price_ttc * l.quantity - l.discount_amount);
                return (
                  <div key={i} className="flex items-baseline justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{l.label}</div>
                      <div className="text-xs text-ink-soft">
                        {formatQty(l.quantity)} × {formatEUR(l.unit_price_ttc)}
                        {l.discount_amount > 0 ? ` (-${formatEUR(l.discount_amount)})` : ''}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatEUR(lineTtc)}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-baseline justify-between rounded-xl bg-gray-50 px-3 py-2.5">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-semibold tabular-nums">{formatEUR(totalTtc)}</span>
            </div>
          </div>

          {/* Colonne 2 : à payer + pavé numérique + paiements enregistrés */}
          <div className="mt-3 lg:mt-0 flex flex-col">
            <div className="rounded-xl border border-border p-3 lg:p-4 bg-gray-50">
              <div className="flex items-baseline justify-between">
                <span className="text-xs lg:text-sm uppercase tracking-wider text-ink-soft">À payer</span>
                <span className={`text-2xl lg:text-4xl font-semibold tabular-nums ${remaining === 0 ? 'text-success' : ''}`}>
                  {formatEUR(remaining)}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
                <span className="text-[11px] lg:text-xs text-ink-soft">Montant saisi (vide = tout le reste)</span>
                <span className="text-base lg:text-xl font-medium tabular-nums">
                  {amountStr === '' ? '—' : formatEUR(Number(amountStr) || 0)}
                </span>
              </div>
              {change > 0 && (
                <div className="mt-2 rounded-lg bg-success/10 px-2.5 py-1.5 flex items-baseline justify-between">
                  <span className="text-success font-medium text-xs lg:text-sm">Rendu monnaie</span>
                  <span className="text-lg lg:text-2xl font-semibold text-success">{formatEUR(change)}</span>
                </div>
              )}
            </div>

            <div className="mt-2 lg:mt-3 grid grid-cols-3 gap-1.5 lg:gap-3">
              {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  className="h-12 lg:h-16 rounded-xl border border-border bg-white text-xl lg:text-2xl font-medium hover:bg-gray-50 active:scale-95 transition"
                >
                  {k}
                </button>
              ))}
            </div>

            {payments.length > 0 && (
              <div className="mt-2 lg:mt-3">
                <div className="text-[10px] lg:text-xs uppercase tracking-wider text-ink-soft mb-1.5">Paiements</div>
                <ul className="space-y-1">
                  {payments.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1 text-xs lg:text-sm">
                      <span className="font-medium truncate">{p.label}</span>
                      <span className="tabular-nums whitespace-nowrap">{formatEUR(p.amount)}</span>
                      <button
                        onClick={() => removePayment(p.key)}
                        aria-label="Retirer ce paiement"
                        className="h-9 w-9 grid place-items-center rounded-md text-ink-soft hover:bg-danger/10 hover:text-danger shrink-0"
                      >✕</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs lg:text-sm text-danger">{error}</div>
            )}
          </div>

          {/* Colonne 3 : modes de règlement */}
          <div className="mt-3 lg:mt-0">
            <div className="text-[10px] lg:text-xs uppercase tracking-wider text-ink-soft mb-1">
              Mode de règlement
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-1.5 lg:gap-2.5">
              {methods.map((m) => {
                // « En compte » désactivé sans client (vente anonyme).
                const blockedDeferred = m.kind === 'deferred' && !hasCustomer;
                return (
                <button
                  key={m.kind + m.label}
                  onClick={() => tapMethod(m)}
                  disabled={(remaining <= 0 && Number(amountStr || '0') <= 0) || blockedDeferred}
                  title={blockedDeferred ? 'Rattachez un client pour payer en compte' : undefined}
                  className="btn-soft h-12 lg:h-16 text-sm lg:text-base font-medium px-2 leading-tight disabled:opacity-40"
                >
                  {m.label}
                </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Valider — barre pleine largeur. padding bas garanti (≥1rem)
            EN PLUS de la safe-area iOS : sinon le bouton colle au bord de
            l'écran sur desktop (où env(safe-area)=0). */}
        <div
          className="border-t border-border px-4 lg:px-8 pt-3 bg-white shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            disabled={loading || !canValidate}
            onClick={() => void validate()}
            className="btn-primary w-full h-14 lg:h-16 text-lg lg:text-xl font-semibold"
          >
            {loading ? 'Validation…' : canValidate ? `✓ Valider · ${formatEUR(totalTtc)}` : `Reste à régler ${formatEUR(remaining)}`}
          </button>
        </div>
      </div>

      {lookupKind && (
        <ReferencePaymentModal
          kind={lookupKind}
          label={lookupLabel}
          remainingDue={remaining}
          typedAmount={lookupAmountSeed}
          onClose={() => setLookupKind(null)}
          onConfirm={(ref, amount, remainingOnRef) =>
            addReferencePayment({ method: lookupKind, label: lookupLabel, reference: ref, amount, remainingOnRef })
          }
        />
      )}
    </div>
  );
}

function cryptoKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

interface RefLookupResult {
  reference: string;
  remaining: number;
  label: string;
  meta?: string;
}

function ReferencePaymentModal({
  kind, label, remainingDue, typedAmount, onClose, onConfirm,
}: {
  kind: 'credit_note' | 'gift_card';
  label: string;
  remainingDue: number;
  typedAmount: number;
  onClose: () => void;
  onConfirm: (reference: string, amount: number, remainingOnRef: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<RefLookupResult | null>(null);
  const [results, setResults] = useState<Array<{ id: string; code: string; balance: number; buyer_name: string | null; buyer_phone: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(typedAmount > 0 ? typedAmount : 0);

  // À l'ouverture de la modale, on précharge les cartes / avoirs les plus
  // récents pour faciliter le repérage visuel.
  useEffect(() => {
    if (kind === 'gift_card') void searchGiftCards('');
    else void searchCreditNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function lookup(value: string) {
    setError(null);
    setLoading(true);
    setFound(null);
    try {
      if (kind === 'credit_note') {
        const r = await fetch(`/api/credit-notes/lookup?number=${encodeURIComponent(value.trim())}`);
        if (!r.ok) { setError('Avoir introuvable'); return; }
        const j = await r.json();
        if (!j.usable) { setError(`Avoir ${j.status}, non utilisable.`); return; }
        setFound({ reference: j.number, remaining: j.remaining, label: 'Avoir', meta: j.reason ?? '' });
        if (amount === 0) setAmount(Math.min(j.remaining, remainingDue));
      } else {
        const r = await fetch(`/api/gift-cards/lookup?code=${encodeURIComponent(value.trim())}`);
        if (!r.ok) { setError('Carte cadeau introuvable'); return; }
        const j = await r.json();
        if (!j.usable) { setError(`Carte non utilisable (${j.status}).`); return; }
        setFound({
          reference: j.code, remaining: j.remaining,
          label: 'Carte cadeau',
          meta: j.buyer_name ?? '',
        });
        if (amount === 0) setAmount(Math.min(j.remaining, remainingDue));
      }
    } finally {
      setLoading(false);
    }
  }

  async function searchGiftCards(q: string) {
    if (kind !== 'gift_card') { setResults([]); return; }
    const r = await fetch(`/api/gift-cards?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    const j = await r.json();
    setResults(
      (j.gift_cards as Array<{
        id: string; code: string; balance: string;
        buyer_name: string | null; buyer_phone: string | null;
        beneficiary_name?: string | null;
      }>)
        .map((c) => ({
          id: c.id,
          code: c.code,
          balance: Number(c.balance),
          buyer_name: c.beneficiary_name ?? c.buyer_name ?? null,
          buyer_phone: c.buyer_phone,
        })),
    );
  }

  async function searchCreditNotes(q: string) {
    if (kind !== 'credit_note') { setResults([]); return; }
    const r = await fetch(`/api/credit-notes?q=${encodeURIComponent(q)}`);
    if (!r.ok) return;
    const j = await r.json();
    setResults(
      (j.credit_notes as Array<{
        id: string; number: string; amount: string; used_amount: string;
        status: string; customer_name: string | null;
      }>)
        .filter((c) => c.status === 'open' || c.status === 'partially_used')
        .map((c) => ({
          id: c.id,
          code: c.number,
          balance: Number(c.amount) - Number(c.used_amount),
          buyer_name: c.customer_name,
          buyer_phone: null,
        })),
    );
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink/40 p-4">
      <div className="card max-w-lg w-full p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{label}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>
        <p className="text-xs text-ink-soft mt-1">
          {kind === 'credit_note'
            ? "Scannez le numéro d'avoir ou cherchez par numéro / client."
            : 'Scannez ou saisissez le code de la carte cadeau, ou recherchez par nom / téléphone.'}
        </p>

        <div className="mt-3 flex gap-2">
          <input
            autoFocus
            className="input flex-1 h-12 text-base"
            placeholder={kind === 'credit_note' ? 'A-2026-… ou nom client' : '29… ou nom / téléphone'}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (kind === 'gift_card') void searchGiftCards(e.target.value);
              else void searchCreditNotes(e.target.value);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') void lookup(search); }}
          />
          <button onClick={() => void lookup(search)} className="btn-soft h-12 text-base px-4">
            {loading ? '…' : 'Vérifier'}
          </button>
        </div>

        {results.length > 0 && !found && (
          <ul className="mt-3 space-y-1.5 max-h-60 overflow-auto">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-gray-50 active:scale-[0.99]"
                  onClick={() => { setSearch(c.code); void lookup(c.code); }}
                >
                  <div className="flex justify-between text-sm">
                    <span className="font-mono">{c.code}</span>
                    <span className="font-medium">{formatEUR(c.balance)}</span>
                  </div>
                  <div className="text-xs text-ink-soft">
                    {c.buyer_name ?? '—'}{c.buyer_phone ? ` · ${c.buyer_phone}` : ''}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {found && (
          <div className="mt-4 rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">{found.reference}</span>
              <span className="font-semibold text-success">Solde {formatEUR(found.remaining)}</span>
            </div>
            {found.meta && <div className="text-xs text-ink-soft">{found.meta}</div>}

            <div>
              <label className="text-xs font-medium text-ink-soft">Montant à utiliser</label>
              <input
                type="number" step="0.01" min={0}
                max={Math.min(found.remaining, remainingDue)}
                className="input mt-1 h-12 text-xl font-semibold"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-xs text-ink-soft">
                Maximum utilisable : {formatEUR(Math.min(found.remaining, remainingDue))}
              </p>
            </div>

            <button
              disabled={amount <= 0 || amount > Math.min(found.remaining, remainingDue) + 0.005}
              onClick={() => onConfirm(found.reference, amount, found.remaining)}
              className="btn-primary w-full h-14 text-lg font-semibold"
            >
              Utiliser {formatEUR(amount)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
