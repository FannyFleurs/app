/**
 * Validation d'une vente avec ses règlements (POST /api/sales/{id}/validate)
 * + ouverture physique du tiroir sur l'app native si un mode utilisé l'exige
 * — logique PARTAGÉE entre PaymentModal (choix manuel du mode de règlement)
 * et les raccourcis d'encaissement direct de la caisse (ex. bouton « CB »,
 * voir CashRegister.tsx::quickPayCard), pour que les deux chemins ouvrent le
 * tiroir exactement de la même façon et traduisent les mêmes codes d'erreur.
 */

export type CheckoutMethod =
  | 'cash' | 'card' | 'check' | 'transfer' | 'gift_card' | 'credit_note'
  | 'payment_link' | 'other' | 'deferred' | 'loyalty';

export interface CheckoutPayment {
  method: CheckoutMethod;
  amount: number;
  given_amount?: number;
  reference?: string;
  label?: string;
}

export interface CheckoutSuccess {
  ok: true;
  receipt_id: string;
  receipt_number: string;
  loyalty?: { earned: number; redeemed: number; new_balance: number } | null;
  gift_cards_issued?: Array<{ id: string; code: string; amount: number; printed?: boolean }>;
}
export interface CheckoutFailure {
  ok: false;
  error: string;
}

export async function submitSaleValidation(args: {
  saleId: string;
  payments: CheckoutPayment[];
  storeId?: string;
  /** Modes de règlement actifs de la boutique (pour savoir si CE règlement
   *  doit ouvrir le tiroir) — voir lib/settings/payment-method-drawer.ts. */
  methods: Array<{ kind: CheckoutMethod; opens_drawer?: boolean }>;
}): Promise<CheckoutSuccess | CheckoutFailure> {
  const res = await fetch(`/api/sales/${args.saleId}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payments: args.payments.map((p) => ({
        method: p.method, amount: p.amount, given_amount: p.given_amount,
        reference: p.reference, label: p.label,
      })),
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const code = j.error ?? j.message;
    return {
      ok: false,
      error: code === 'CASH_SESSION_CLOSED' || code === 'NO_OPEN_CASH_SESSION'
        ? 'Journée clôturée : rouvrez la caisse (fonds de caisse) avant d\'encaisser.'
        : code ?? 'Erreur d\'encaissement',
    };
  }
  const j = await res.json();

  // Sur la caisse native, l'ouverture physique du tiroir est pilotée par le
  // même endpoint que le bouton « ouvrir le tiroir ». Le serveur de
  // validation conserve son comportement CloudPRNT ; cet appel permet à la
  // coque native d'intercepter la demande et d'envoyer l'impulsion IP. On ne
  // le déclenche que si au moins un mode réellement utilisé est configuré
  // avec « Tiroir » dans les réglages (propre à la boutique, voir
  // lib/settings/payment-method-drawer.ts).
  const shouldOpenDrawer = args.payments.some((p) =>
    args.methods.some((m) => m.kind === p.method && m.opens_drawer === true),
  );
  const isNativeApp =
    typeof window !== 'undefined' && Boolean((window as unknown as { Capacitor?: unknown }).Capacitor);
  if (shouldOpenDrawer && isNativeApp) {
    try {
      await fetch('/api/cash-sessions/open-drawer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: args.storeId || undefined, reason: 'Encaissement' }),
      });
    } catch {
      // Une panne d'ouverture du tiroir ne doit jamais annuler une vente
      // déjà validée fiscalement.
    }
  }

  return {
    ok: true, receipt_id: j.receipt_id, receipt_number: j.receipt_number,
    loyalty: j.loyalty, gift_cards_issued: j.gift_cards_issued,
  };
}
