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
  /** Favicon de l'app (onglet navigateur). Vide = utilise le logo. */
  favicon_url: string;
  /** Logo distinct pour l'espace CA (ca.). Vide = utilise le logo principal. */
  ca_logo_url: string;
  /** Favicon de l'espace CA. Vide = utilise le logo CA. */
  ca_favicon_url: string;
  /** Favicon du back-office (bo.). Vide = favicon/logo principal. */
  bo_favicon_url: string;
  /** Favicon de la console super-admin (admin.). Vide = favicon/logo principal. */
  admin_favicon_url: string;
  /** Visuel affiché sur l'écran de connexion caisse (photo). Vide = logo/défaut. */
  login_image_url: string;
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
  /** Price IDs Stripe des offres (mode subscription). */
  stripe_price_essentiel: string;
  stripe_price_croissance: string;
  stripe_price_reseau: string;
  /** Noms affichés des offres (modifiables). */
  plan_essentiel_name: string;
  plan_croissance_name: string;
  plan_reseau_name: string;
  /** Durée de l'essai gratuit avant le 1er débit. */
  trial_days: number;
  /** Montants affichés des 2 offres (€ HT/mois) — cosmétique, doivent
   *  correspondre aux prix Stripe. */
  plan_essentiel_price: string;
  plan_croissance_price: string;
  plan_reseau_price: string;
  /** Option caisse supplémentaire : Price ID Stripe + montant affiché. */
  stripe_price_extra_register: string;
  addon_register_price: string;
}

/** Nom d'affichage d'une offre selon la config (fallback intégré). */
export function planDisplayName(plan: string | null | undefined, p: PlatformSettings): string {
  switch (plan) {
    case 'starter': return p.plan_essentiel_name || 'Essentiel';
    case 'pro': return p.plan_croissance_name || 'Croissance';
    case 'enterprise': return p.plan_reseau_name || 'Réseau';
    default: return 'Essai';
  }
}

export const PLATFORM_DEFAULTS: PlatformSettings = {
  brand_name: 'HelloPos',
  logo_url: '',
  favicon_url: '',
  ca_logo_url: '',
  ca_favicon_url: '',
  bo_favicon_url: '',
  admin_favicon_url: '',
  login_image_url: '',
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
  stripe_price_reseau: '',
  plan_essentiel_name: 'Essentiel',
  plan_croissance_name: 'Croissance',
  plan_reseau_name: 'Réseau',
  trial_days: 14,
  plan_essentiel_price: '29',
  plan_croissance_price: '59',
  plan_reseau_price: 'Sur mesure',
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
