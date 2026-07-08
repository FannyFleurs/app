/**
 * Paramétrage "Écran & Livraison" : option payante (a l'avenir) qui
 * debloque les fonctionnalites de retrait a date et de livraison.
 *
 * Stocké dans la table `settings` sous la clé `screen_delivery`.
 * Tant que `enabled` est false :
 *   - le bouton "Commande differee (retrait a date)" est masque en caisse
 *   - les futurs modules d'affichage client / preparation en vitrine
 *     restent inertes.
 */

export const SCREEN_DELIVERY_KEY = 'screen_delivery';

export interface ScreenDeliverySettings {
  /** Active le module de commande differee + affichage client. */
  enabled: boolean;
  /**
   * Delai minimum entre commande et retrait (en heures). Ex 2 = on ne
   * propose pas de creneau dans les 2 heures qui suivent la commande.
   */
  min_lead_hours: number;
  /** Autorise la livraison en plus du retrait en magasin. */
  delivery_enabled: boolean;
  /** Frais de livraison par defaut (TTC). */
  delivery_fee: number;
  /**
   * URL de l'ecran client (affichage second en vitrine). Vide = pas
   * d'ecran configure.
   */
  screen_url: string;
  /** Message d'accueil affiche sur l'ecran client. */
  screen_welcome: string;
}

export const SCREEN_DELIVERY_DEFAULTS: ScreenDeliverySettings = {
  enabled: false,
  min_lead_hours: 2,
  delivery_enabled: false,
  delivery_fee: 0,
  screen_url: '',
  screen_welcome: 'Bienvenue',
};

export function mergeScreenDeliveryDefaults(
  partial: Partial<ScreenDeliverySettings> | null | undefined,
): ScreenDeliverySettings {
  if (!partial) return { ...SCREEN_DELIVERY_DEFAULTS };
  const out = { ...SCREEN_DELIVERY_DEFAULTS };
  for (const k of Object.keys(SCREEN_DELIVERY_DEFAULTS) as (keyof ScreenDeliverySettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error merge homogene
      out[k] = partial[k];
    }
  }
  return out;
}
