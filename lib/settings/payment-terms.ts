/**
 * Conditions de règlement des factures (isomorphe client/serveur).
 * Chaque condition porte un code stable (stocké sur le client / la facture),
 * un libellé affiché sur la facture, et le calcul d'échéance associé.
 */
export interface PaymentTerm {
  code: string;
  label: string;
  /** Nombre de jours à ajouter à la date d'émission, ou 'eom' (fin de mois). */
  days: number | 'eom';
}

export const PAYMENT_TERMS: PaymentTerm[] = [
  { code: 'on_receipt', label: 'À réception de facture', days: 0 },
  { code: 'net_10', label: '10 jours', days: 10 },
  { code: 'net_15', label: '15 jours', days: 15 },
  { code: 'net_30', label: '30 jours (1 mois)', days: 30 },
  { code: 'net_45', label: '45 jours', days: 45 },
  { code: 'net_60', label: '60 jours', days: 60 },
  { code: 'eom_30', label: '30 jours fin de mois', days: 'eom' },
];

export const DEFAULT_PAYMENT_TERM = 'on_receipt';

export function paymentTerm(code?: string | null): PaymentTerm | null {
  if (!code) return null;
  return PAYMENT_TERMS.find((t) => t.code === code) ?? null;
}

/** Libellé affichable (ex. « 30 jours (1 mois) »), null si code inconnu/absent. */
export function paymentTermLabel(code?: string | null): string | null {
  return paymentTerm(code)?.label ?? null;
}

/**
 * Date d'échéance (YYYY-MM-DD) à partir d'une date d'émission (YYYY-MM-DD) et
 * d'un code de condition. « À réception » ⇒ date d'émission. « Fin de mois »
 * ⇒ +30 jours puis dernier jour du mois.
 */
export function computeDueDate(issueISO: string, code?: string | null): string {
  const term = paymentTerm(code);
  const d = new Date(`${issueISO}T00:00:00Z`);
  if (!term || term.days === 0) return issueISO;
  if (term.days === 'eom') {
    d.setUTCDate(d.getUTCDate() + 30);
    // Dernier jour du mois courant.
    d.setUTCMonth(d.getUTCMonth() + 1, 0);
  } else {
    d.setUTCDate(d.getUTCDate() + (term.days as number));
  }
  return d.toISOString().slice(0, 10);
}
