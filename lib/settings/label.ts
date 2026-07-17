/**
 * Paramétrage des étiquettes produit : format (dimensions) + éléments à
 * imprimer. Stocké dans la table `settings` sous la clé `label`, au niveau
 * organisation.
 */
export const LABEL_KEY = 'label';

/** Formats courants proposés en un clic dans les réglages. */
export const LABEL_SIZE_PRESETS = [
  { label: '50 × 30 mm (rouleau)', w: 50, h: 30 },
  { label: '40 × 30 mm (rouleau)', w: 40, h: 30 },
  { label: '57 × 32 mm (rouleau)', w: 57, h: 32 },
  { label: '32 × 25 mm (petit)',   w: 32, h: 25 },
] as const;

export interface LabelSettings {
  /** Dimensions de l'étiquette en millimètres. */
  width_mm: number;
  height_mm: number;
  /** Éléments imprimés sur l'étiquette. */
  show_name: boolean;
  show_barcode: boolean;
  show_price: boolean;
  /** Affiche le prix remisé (barré + remisé) si l'article a une remise. */
  show_discount: boolean;
  /** Affiche la référence (SKU). */
  show_sku: boolean;
}

export const LABEL_DEFAULTS: LabelSettings = {
  width_mm: 50,
  height_mm: 30,
  show_name: true,
  show_barcode: true,
  show_price: true,
  show_discount: true,
  show_sku: false,
};

function clampMm(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(10, Math.round(n)));
}

export function mergeLabelDefaults(partial: Partial<LabelSettings> | null | undefined): LabelSettings {
  if (!partial) return { ...LABEL_DEFAULTS };
  return {
    width_mm: clampMm(partial.width_mm, LABEL_DEFAULTS.width_mm),
    height_mm: clampMm(partial.height_mm, LABEL_DEFAULTS.height_mm),
    show_name: partial.show_name ?? LABEL_DEFAULTS.show_name,
    show_barcode: partial.show_barcode ?? LABEL_DEFAULTS.show_barcode,
    show_price: partial.show_price ?? LABEL_DEFAULTS.show_price,
    show_discount: partial.show_discount ?? LABEL_DEFAULTS.show_discount,
    show_sku: partial.show_sku ?? LABEL_DEFAULTS.show_sku,
  };
}
