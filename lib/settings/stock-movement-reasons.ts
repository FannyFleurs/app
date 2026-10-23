/**
 * Motifs proposés pour un mouvement de stock manuel (entrée/sortie,
 * ajustement, inventaire) — configurables par organisation (Paramètres →
 * Motifs de mouvement de stock). Persisté dans la table `settings` sous la
 * clé `stock_movement_reasons`, au niveau organisation (pas de boutique).
 *
 * Le motif reste, comme avant ce réglage, obligatoire UNIQUEMENT pour une
 * sortie de stock (quantité négative) — une entrée garde un motif facultatif
 * quoi qu'il arrive. `justification_required` active/désactive cette règle :
 * décoché, le motif devient facultatif même en sortie.
 */

export const STOCK_MOVEMENT_REASONS_KEY = 'stock_movement_reasons';

export interface StockMovementReasonsSettings {
  reasons: string[];
  justification_required: boolean;
}

export const DEFAULT_STOCK_MOVEMENT_REASONS = [
  'Casse',
  'Produit périmé',
  'Écart inventaire',
  'Vol / disparition',
  'Retour fournisseur',
];

export const STOCK_MOVEMENT_REASONS_DEFAULTS: StockMovementReasonsSettings = {
  reasons: DEFAULT_STOCK_MOVEMENT_REASONS,
  justification_required: true,
};

export function mergeStockMovementReasonsDefaults(
  partial: Partial<StockMovementReasonsSettings> | null | undefined,
): StockMovementReasonsSettings {
  const p = partial ?? {};
  return {
    reasons: Array.isArray(p.reasons) ? p.reasons : STOCK_MOVEMENT_REASONS_DEFAULTS.reasons,
    justification_required: p.justification_required !== false,
  };
}
