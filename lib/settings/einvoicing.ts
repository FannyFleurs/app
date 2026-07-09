/**
 * Paramétrage de la facturation électronique (réforme française
 * 2026-2027). Volontairement générique : on ne fige pas le format ni le
 * fournisseur, on prépare la connexion future à une plateforme agréée
 * (PDP — Plateforme de Dématérialisation Partenaire) ou l'export JSON.
 *
 * Stocké dans la table `settings` sous la clé `einvoicing`.
 */

export const EINVOICING_KEY = 'einvoicing';

/** Formats normalisés de facture électronique. */
export const EINVOICE_FORMATS = ['factur-x', 'ubl', 'cii'] as const;
export type EInvoiceFormat = (typeof EINVOICE_FORMATS)[number];

/**
 * Mode de transmission :
 *   - off    : rien (on collecte juste les données structurées)
 *   - pdp    : envoi via une plateforme agréée (API)
 *   - export : export JSON manuel (on télécharge / envoie soi-même)
 */
export const EINVOICE_MODES = ['off', 'pdp', 'export'] as const;
export type EInvoiceMode = (typeof EINVOICE_MODES)[number];

export interface EInvoicingSettings {
  /** Active la préparation e-facturation (champs + export). */
  enabled: boolean;
  mode: EInvoiceMode;
  format: EInvoiceFormat;
  /** Nom de la plateforme agréée (PDP) choisie. */
  pdp_name: string;
  /** Endpoint API de la plateforme (rempli le moment venu). */
  pdp_endpoint: string;
  /** Clé/API token de la plateforme. Jamais réaffichée en clair. */
  pdp_api_key: string;
  /** Envoi automatique à la validation de la facture. */
  auto_send: boolean;
}

export const EINVOICING_DEFAULTS: EInvoicingSettings = {
  enabled: false,
  mode: 'off',
  format: 'factur-x',
  pdp_name: '',
  pdp_endpoint: '',
  pdp_api_key: '',
  auto_send: false,
};

export function mergeEInvoicingDefaults(
  partial: Partial<EInvoicingSettings> | null | undefined,
): EInvoicingSettings {
  if (!partial) return { ...EINVOICING_DEFAULTS };
  const out = { ...EINVOICING_DEFAULTS };
  for (const k of Object.keys(EINVOICING_DEFAULTS) as (keyof EInvoicingSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error merge homogène
      out[k] = partial[k];
    }
  }
  return out;
}

/** Masque une clé API pour l'affichage (garde les 4 derniers). */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '••••';
  return '••••••••' + key.slice(-4);
}
