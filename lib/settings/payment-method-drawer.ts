/**
 * Ouverture du tiroir-caisse par mode de règlement — paramétrable PAR
 * BOUTIQUE (chaque boutique gère ses propres modes de règlement, voir
 * payment-method-drawer-server.ts). Avant l'introduction de ce paramétrage,
 * seule la colonne `payment_methods.opens_drawer` existait : une valeur
 * UNIQUE par mode, partagée par toutes les boutiques de l'organisation —
 * modifier le réglage depuis une boutique le modifiait donc pour toutes les
 * autres. Cette colonne reste la valeur de repli tant qu'une boutique n'a
 * pas défini la sienne (voir loadEffectivePaymentMethodDrawerMap).
 *
 * Forme stockée : une carte { [code du mode de règlement]: ouvre le tiroir }
 * par boutique, sous la clé `payment_method_drawer:<storeId>`.
 */

export const PAYMENT_METHOD_DRAWER_KEY = 'payment_method_drawer';

export type PaymentMethodDrawerMap = Record<string, boolean>;

export function mergePaymentMethodDrawerMap(
  partial: Record<string, unknown> | null | undefined,
): PaymentMethodDrawerMap {
  if (!partial || typeof partial !== 'object') return {};
  const out: PaymentMethodDrawerMap = {};
  for (const [code, value] of Object.entries(partial)) {
    if (typeof value === 'boolean') out[code] = value;
  }
  return out;
}
