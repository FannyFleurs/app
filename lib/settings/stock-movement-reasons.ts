/**
 * Motifs proposés pour un mouvement de stock manuel (entrée/sortie,
 * ajustement, inventaire) — configurables par organisation (Paramètres →
 * Motifs de mouvement de stock). Persisté dans la table `settings` sous la
 * clé `stock_movement_reasons`, au niveau organisation (pas de boutique).
 *
 * Chaque motif porte sa PROPRE case « justification obligatoire », qui ne
 * s'applique QU'EN SORTIE (quantité négative) — une entrée garde un motif
 * facultatif quoi qu'il arrive, quel que soit le motif choisi. Un motif
 * libre (texte qui ne correspond à aucun des motifs ci-dessous), en sortie,
 * est obligatoire par défaut.
 */

export const STOCK_MOVEMENT_REASONS_KEY = 'stock_movement_reasons';

export interface StockMovementReason {
  label: string;
  justification_required: boolean;
}

export interface StockMovementReasonsSettings {
  reasons: StockMovementReason[];
}

export const DEFAULT_STOCK_MOVEMENT_REASONS: StockMovementReason[] = [
  { label: 'Casse', justification_required: true },
  { label: 'Produit périmé', justification_required: true },
  { label: 'Écart inventaire', justification_required: true },
  { label: 'Vol / disparition', justification_required: true },
  { label: 'Retour fournisseur', justification_required: true },
];

export const STOCK_MOVEMENT_REASONS_DEFAULTS: StockMovementReasonsSettings = {
  reasons: DEFAULT_STOCK_MOVEMENT_REASONS,
};

/**
 * Tolère aussi l'ancienne forme (`reasons: string[]` + `justification_required`
 * global), persistée en production avant l'introduction de la case par motif
 * — convertie à la volée pour ne pas perdre les motifs déjà enregistrés par
 * une organisation.
 */
export function mergeStockMovementReasonsDefaults(
  partial:
    | { reasons?: (string | StockMovementReason)[]; justification_required?: boolean }
    | null
    | undefined,
): StockMovementReasonsSettings {
  const p = partial ?? {};
  if (!Array.isArray(p.reasons)) return { reasons: DEFAULT_STOCK_MOVEMENT_REASONS };

  const legacyRequired = p.justification_required !== false;
  const reasons = p.reasons
    .map((r): StockMovementReason | null => {
      if (typeof r === 'string') {
        const label = r.trim();
        return label ? { label, justification_required: legacyRequired } : null;
      }
      if (r && typeof r === 'object' && typeof (r as StockMovementReason).label === 'string') {
        const label = (r as StockMovementReason).label.trim();
        return label ? { label, justification_required: (r as StockMovementReason).justification_required === true } : null;
      }
      return null;
    })
    .filter((r): r is StockMovementReason => r !== null);

  return { reasons };
}
