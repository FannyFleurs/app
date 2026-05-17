/**
 * Module monétaire — toutes les sommes manipulées en TTC ou HT sont des nombres
 * arrondis à 2 décimales (centimes). La répartition TVA suit la règle classique :
 *   - on calcule la TVA ligne à ligne arrondie au centime
 *   - on regroupe par taux pour le pied de ticket
 * Les bases de calcul (NUMERIC 12,4) en BDD permettent de garder 4 décimales
 * pour les prix unitaires (utile pour vente au gramme / à la tige).
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export interface LineInput {
  unitPriceTtc: number;
  quantity: number;
  discountAmount?: number;  // remise en € sur la ligne (TTC)
  taxRate: number;          // % ex 20, 10, 5.5, 0
}

export interface LineComputed {
  unit_price_ttc: number;
  quantity: number;
  discount_amount: number;
  line_ttc: number;
  line_ht: number;
  line_tva: number;
  tax_rate: number;
}

export function computeLine(input: LineInput): LineComputed {
  const unit = round4(input.unitPriceTtc);
  const qty = round4(input.quantity);
  const discount = round2(input.discountAmount ?? 0);
  const rawTtc = unit * qty - discount;
  const lineTtc = round2(rawTtc < 0 ? 0 : rawTtc);
  const rate = input.taxRate;
  const lineHt = round2(lineTtc / (1 + rate / 100));
  const lineTva = round2(lineTtc - lineHt);
  return {
    unit_price_ttc: unit,
    quantity: qty,
    discount_amount: discount,
    line_ttc: lineTtc,
    line_ht: lineHt,
    line_tva: lineTva,
    tax_rate: rate,
  };
}

export interface CartTotals {
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  total_discount: number;
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
}

export function computeTotals(lines: LineComputed[]): CartTotals {
  const byRate = new Map<number, { base_ht: number; tva: number; ttc: number }>();
  let totalHt = 0;
  let totalTva = 0;
  let totalTtc = 0;
  let totalDiscount = 0;

  for (const l of lines) {
    totalHt = round2(totalHt + l.line_ht);
    totalTva = round2(totalTva + l.line_tva);
    totalTtc = round2(totalTtc + l.line_ttc);
    totalDiscount = round2(totalDiscount + l.discount_amount);

    const bucket = byRate.get(l.tax_rate) ?? { base_ht: 0, tva: 0, ttc: 0 };
    bucket.base_ht = round2(bucket.base_ht + l.line_ht);
    bucket.tva = round2(bucket.tva + l.line_tva);
    bucket.ttc = round2(bucket.ttc + l.line_ttc);
    byRate.set(l.tax_rate, bucket);
  }

  const tva_breakdown = Array.from(byRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, v]) => ({ rate, ...v }));

  return { total_ht: totalHt, total_tva: totalTva, total_ttc: totalTtc, total_discount: totalDiscount, tva_breakdown };
}

export function formatEUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
