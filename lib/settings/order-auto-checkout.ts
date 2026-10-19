/**
 * Encaissement automatique des commandes entrantes (WEB / OGF) : quand une
 * commande arrive via l'app commande (voir lib/services/order-intake.ts) et
 * que ce réglage est actif pour sa boutique, elle est encaissée IMMÉDIATEMENT
 * sur la caisse virtuelle (lib/services/virtual-register.ts), avec le mode de
 * règlement par défaut de sa source — plutôt que de rester "en attente"
 * jusqu'au passage d'un caissier. Réglage par boutique (clé
 * `order_auto_checkout:<storeId>`, repli organisation).
 */

export const ORDER_AUTO_CHECKOUT_KEY = 'order_auto_checkout';

export interface OrderAutoCheckoutSettings {
  enabled: boolean;
  /** `payment_methods.id` à utiliser pour une commande source "WEB". */
  web_payment_method_id: string | null;
  /** `payment_methods.id` à utiliser pour une commande source "OGF". */
  ogf_payment_method_id: string | null;
}

export const ORDER_AUTO_CHECKOUT_DEFAULTS: OrderAutoCheckoutSettings = {
  enabled: false,
  web_payment_method_id: null,
  ogf_payment_method_id: null,
};

export function mergeOrderAutoCheckoutDefaults(
  partial: Partial<OrderAutoCheckoutSettings> | null | undefined,
): OrderAutoCheckoutSettings {
  const p = partial ?? {};
  return {
    enabled: p.enabled === true,
    web_payment_method_id: typeof p.web_payment_method_id === 'string' ? p.web_payment_method_id : null,
    ogf_payment_method_id: typeof p.ogf_payment_method_id === 'string' ? p.ogf_payment_method_id : null,
  };
}

/** Clé de réglage par source (OGF / WEB), pour résoudre dynamiquement. */
export function paymentMethodFieldForSource(source: 'OGF' | 'WEB'): 'ogf_payment_method_id' | 'web_payment_method_id' {
  return source === 'OGF' ? 'ogf_payment_method_id' : 'web_payment_method_id';
}
