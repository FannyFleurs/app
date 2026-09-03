/**
 * Intégration « Commande entrante » : une application de commande externe
 * (ex. l'app Fanny Fleurs hébergée sur Supabase) pousse des commandes vers
 * HelloPos, qui les matérialise en ventes EN ATTENTE dans la bonne boutique.
 * Le caissier les retrouve dans « En attente » et les encaisse normalement ;
 * une fois réglées, HelloPos rappelle l'app externe pour la marquer « Payé ».
 *
 * Réglage RÉSERVÉ à une organisation précise (activé au cas par cas par le
 * super-admin). Stocké dans `settings` sous la clé `order_integration`.
 * Tant que `enabled` est faux, l'endpoint entrant refuse et rien ne change
 * pour l'organisation.
 */

export const ORDER_INTEGRATION_KEY = 'order_integration';

/** Correspondance « libellé boutique côté app commande » -> store HelloPos. */
export type BoutiqueMap = Record<string, string>;

export interface OrderIntegrationSettings {
  /** Active l'endpoint entrant et le callback pour cette organisation. */
  enabled: boolean;
  /** SHA-256 du jeton entrant (le jeton en clair n'est montré qu'à la création). */
  token_hash: string | null;
  /** Derniers caractères du jeton, pour repère à l'écran (jamais le jeton entier). */
  token_hint: string | null;
  /** Libellé boutique (tel qu'envoyé par l'app commande) -> id du store HelloPos. */
  boutique_map: BoutiqueMap;
  /** URL appelée après encaissement pour signaler « Payé ». Vide = pas de rappel. */
  callback_url: string | null;
  /** Secret partagé : signe le callback (HMAC). L'app commande vérifie la signature. */
  callback_secret: string | null;
}

export const ORDER_INTEGRATION_DEFAULTS: OrderIntegrationSettings = {
  enabled: false,
  token_hash: null,
  token_hint: null,
  boutique_map: {},
  callback_url: null,
  callback_secret: null,
};

export function mergeOrderIntegrationDefaults(
  partial: Partial<OrderIntegrationSettings> | null | undefined,
): OrderIntegrationSettings {
  if (!partial) return { ...ORDER_INTEGRATION_DEFAULTS, boutique_map: {} };
  return {
    enabled: partial.enabled ?? ORDER_INTEGRATION_DEFAULTS.enabled,
    token_hash: partial.token_hash ?? null,
    token_hint: partial.token_hint ?? null,
    boutique_map: partial.boutique_map ?? {},
    callback_url: partial.callback_url ?? null,
    callback_secret: partial.callback_secret ?? null,
  };
}

/**
 * Vue « publique » du réglage : ce qu'on peut renvoyer à l'écran admin sans
 * jamais divulguer les secrets (jeton, secret de callback).
 */
export interface OrderIntegrationPublic {
  enabled: boolean;
  token_set: boolean;
  token_hint: string | null;
  boutique_map: BoutiqueMap;
  callback_url: string | null;
  callback_secret_set: boolean;
}

export function toPublicOrderIntegration(s: OrderIntegrationSettings): OrderIntegrationPublic {
  return {
    enabled: s.enabled,
    token_set: !!s.token_hash,
    token_hint: s.token_hint,
    boutique_map: s.boutique_map,
    callback_url: s.callback_url,
    callback_secret_set: !!s.callback_secret,
  };
}
