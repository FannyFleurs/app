/**
 * Motifs de justification proposés en caisse pour une remise manuelle (sur
 * une ligne ou sur le panier entier) — configurables par organisation
 * (Paramètres → Motifs de remise). Persisté dans la table `settings` sous
 * la clé `discount_reasons`, au niveau organisation (pas de boutique).
 *
 * Ne concerne QUE les remises : le motif de retrait d'un article du panier
 * (JustificationModal, kind "remove") garde sa propre liste fixe.
 */

export const DISCOUNT_REASONS_KEY = 'discount_reasons';

export interface DiscountReasonsSettings {
  reasons: string[];
  /** Si false, la fenêtre de motif reste affichée mais la saisie est facultative. */
  justification_required: boolean;
}

export const DEFAULT_DISCOUNT_REASONS = [
  'Geste commercial',
  'Erreur de saisie',
  'Produit abîmé',
  'Promotion en cours',
  'Demande client',
];

export const DISCOUNT_REASONS_DEFAULTS: DiscountReasonsSettings = {
  reasons: DEFAULT_DISCOUNT_REASONS,
  justification_required: true,
};

export function mergeDiscountReasonsDefaults(
  partial: Partial<DiscountReasonsSettings> | null | undefined,
): DiscountReasonsSettings {
  const p = partial ?? {};
  return {
    reasons: Array.isArray(p.reasons) ? p.reasons : DISCOUNT_REASONS_DEFAULTS.reasons,
    justification_required: p.justification_required !== false,
  };
}
