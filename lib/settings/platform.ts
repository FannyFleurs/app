/**
 * Configuration globale de la plateforme HelloPos (éditeur du logiciel).
 * Stockée dans la table singleton `platform_settings` (une seule ligne).
 * Éditable uniquement par le super_admin. Sert au branding (logo, nom)
 * et à l'affichage des mentions société sur le site vitrine.
 */

export interface PlatformSettings {
  /** Nom commercial du logiciel (affiché partout). */
  brand_name: string;
  /**
   * Logo : URL externe OU data URL (base64) collée/uploadée. Vide = on
   * affiche le monogramme par défaut.
   */
  logo_url: string;
  /** Identité légale de l'éditeur (pour le site + mentions légales). */
  company_legal_name: string;
  company_siren: string;
  company_siret: string;
  company_vat: string;
  /** Adresse de la société éditrice. */
  address_line1: string;
  address_zip: string;
  address_city: string;
  address_country: string;
  /** Coordonnées publiques affichées sur le site. */
  contact_email: string;
  contact_phone: string;
  website: string;

  /** ---- Facturation SaaS (Stripe plateforme) ---- */
  stripe_secret_key: string;
  stripe_publishable_key: string;
  stripe_webhook_secret: string;
  /** Price IDs Stripe des 2 offres (mode subscription). */
  stripe_price_essentiel: string;
  stripe_price_croissance: string;
  /** Durée de l'essai gratuit avant le 1er débit. */
  trial_days: number;
  /** Montants affichés des 2 offres (€ HT/mois) — cosmétique, doivent
   *  correspondre aux prix Stripe. */
  plan_essentiel_price: string;
  plan_croissance_price: string;
  /** Option caisse supplémentaire : Price ID Stripe + montant affiché. */
  stripe_price_extra_register: string;
  addon_register_price: string;
}

export const PLATFORM_DEFAULTS: PlatformSettings = {
  brand_name: 'HelloPos',
  logo_url: '',
  company_legal_name: '',
  company_siren: '',
  company_siret: '',
  company_vat: '',
  address_line1: '',
  address_zip: '',
  address_city: '',
  address_country: 'France',
  contact_email: '',
  contact_phone: '',
  website: '',
  stripe_secret_key: '',
  stripe_publishable_key: '',
  stripe_webhook_secret: '',
  stripe_price_essentiel: '',
  stripe_price_croissance: '',
  trial_days: 14,
  plan_essentiel_price: '29',
  plan_croissance_price: '59',
  stripe_price_extra_register: '',
  addon_register_price: '9',
};

export function mergePlatformDefaults(
  partial: Partial<PlatformSettings> | null | undefined,
): PlatformSettings {
  if (!partial) return { ...PLATFORM_DEFAULTS };
  const out = { ...PLATFORM_DEFAULTS };
  for (const k of Object.keys(PLATFORM_DEFAULTS) as (keyof PlatformSettings)[]) {
    const v = partial[k];
    if (v !== undefined && v !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (out as any)[k] = v;
    }
  }
  return out;
}
