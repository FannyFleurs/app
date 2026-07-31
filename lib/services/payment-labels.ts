/** Libellés français des modes de règlement (affichés sur les factures). */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'En compte',
  loyalty: 'Fidélité',
  other: 'Autre',
};

export function paymentMethodLabel(code: string): string {
  return PAYMENT_METHOD_LABELS[code] ?? code;
}

/** Concatène des modes de règlement distincts : « Espèces + Carte bancaire ». */
export function joinPaymentMethods(methods: string[]): string {
  const uniq = Array.from(new Set(methods.map(paymentMethodLabel)));
  return uniq.join(' + ');
}
