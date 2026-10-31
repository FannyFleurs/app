import { round2 } from '@/lib/services/money';

/**
 * Répartit des règlements saisis pour UN SEUL encaissement combiné (vente +
 * solde dû du client — voir PaymentModal.tsx, prop `accountSettlement`)
 * entre la part de la VENTE (jusqu'à `saleTotal`) et le reste, destiné au
 * règlement du SOLDE DÛ.
 *
 * La vente doit recevoir EXACTEMENT `saleTotal` (SaleService.validate rejette
 * tout écart, PAYMENTS_MISMATCH) ; le reste — quels que soient les modes
 * utilisés — va au règlement de compte. Un règlement qui chevauche la
 * frontière (ex. une carte de 79€ pour une vente à 49€ + un solde à 30€) est
 * scindé en deux lignes du MÊME mode, chacune avec `given_amount = amount`
 * (aucun « rendu monnaie » n'est recalculé par ce découpage : le rendu réel,
 * s'il y en a, est un calcul d'affichage fait une seule fois côté caller, à
 * partir du total combiné — il ne dépend pas de cette répartition).
 */
export function splitPaymentsForAccountSettlement<T extends { amount: number; given_amount?: number }>(
  payments: T[],
  saleTotal: number,
): { salePayments: T[]; settlementPayments: T[] } {
  let remainingForSale = round2(saleTotal);
  const salePayments: T[] = [];
  const settlementPayments: T[] = [];

  for (const p of payments) {
    const toSale = round2(Math.min(p.amount, Math.max(0, remainingForSale)));
    if (toSale > 0) {
      salePayments.push({ ...p, amount: toSale, given_amount: toSale });
      remainingForSale = round2(remainingForSale - toSale);
    }
    const rest = round2(p.amount - toSale);
    if (rest > 0) {
      settlementPayments.push({ ...p, amount: rest, given_amount: rest });
    }
  }

  return { salePayments, settlementPayments };
}
