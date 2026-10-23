/**
 * Motifs de justification proposés en caisse pour une remise manuelle (sur
 * une ligne ou sur le panier entier) — configurables par organisation
 * (Paramètres → Motifs de remise). Persisté dans la table `settings` sous
 * la clé `discount_reasons`, au niveau organisation (pas de boutique).
 *
 * Chaque motif porte sa PROPRE case « justification obligatoire » — ce
 * n'est pas un réglage unique pour toute la liste : un motif coché exige
 * que le vendeur tape une explication, un motif décoché se contente d'un
 * clic (voir JustificationModal). Un motif libre (texte qui ne correspond à
 * aucun des motifs ci-dessous) est obligatoire par défaut.
 *
 * Ne concerne QUE les remises : le motif de retrait d'un article du panier
 * (JustificationModal, kind "remove") garde sa propre liste fixe.
 */

export const DISCOUNT_REASONS_KEY = 'discount_reasons';

export interface DiscountReason {
  label: string;
  justification_required: boolean;
}

export interface DiscountReasonsSettings {
  reasons: DiscountReason[];
}

export const DEFAULT_DISCOUNT_REASONS: DiscountReason[] = [
  { label: 'Geste commercial', justification_required: true },
  { label: 'Erreur de saisie', justification_required: true },
  { label: 'Produit abîmé', justification_required: true },
  { label: 'Promotion en cours', justification_required: true },
  { label: 'Demande client', justification_required: true },
];

export const DISCOUNT_REASONS_DEFAULTS: DiscountReasonsSettings = {
  reasons: DEFAULT_DISCOUNT_REASONS,
};

/**
 * Tolère aussi l'ancienne forme (`reasons: string[]` + `justification_required`
 * global), persistée en production avant l'introduction de la case par motif
 * — convertie à la volée pour ne pas perdre les motifs déjà enregistrés par
 * une organisation.
 */
export function mergeDiscountReasonsDefaults(
  partial:
    | { reasons?: (string | DiscountReason)[]; justification_required?: boolean }
    | null
    | undefined,
): DiscountReasonsSettings {
  const p = partial ?? {};
  if (!Array.isArray(p.reasons)) return { reasons: DEFAULT_DISCOUNT_REASONS };

  const legacyRequired = p.justification_required !== false;
  const reasons = p.reasons
    .map((r): DiscountReason | null => {
      if (typeof r === 'string') {
        const label = r.trim();
        return label ? { label, justification_required: legacyRequired } : null;
      }
      if (r && typeof r === 'object' && typeof (r as DiscountReason).label === 'string') {
        const label = (r as DiscountReason).label.trim();
        return label ? { label, justification_required: (r as DiscountReason).justification_required === true } : null;
      }
      return null;
    })
    .filter((r): r is DiscountReason => r !== null);

  return { reasons };
}
