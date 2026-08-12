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

/** Position (centre) + taille relative d'un élément sur l'étiquette. */
export interface LabelElementLayout {
  /** Centre horizontal, fraction 0..1 de la largeur. */
  x: number;
  /** Centre vertical, fraction 0..1 de la hauteur. */
  y: number;
  /** Taille relative (1 = taille par défaut). */
  size: number;
}

export type LabelElementKey = 'name' | 'price' | 'barcode' | 'sku';

export type LabelLayout = Record<LabelElementKey, LabelElementLayout>;

export interface LabelSettings {
  /** Dimensions de l'étiquette en millimètres. */
  width_mm: number;
  height_mm: number;
  /**
   * Écart entre deux étiquettes, en millimètres.
   *
   * Un lot est imprimé en UNE image continue : chaque étiquette occupe une
   * case au pas physique du média, soit hauteur + écart. Si cet écart ne
   * correspond pas au rouleau, le décalage s'accumule d'étiquette en
   * étiquette et le lot part de travers.
   *
   *  - papier prédécoupé : l'écart est le blanc entre deux étiquettes (3 mm
   *    sur le rouleau d'origine) ;
   *  - papier à marque noire : le pas EST la hauteur d'étiquette, donc 0 —
   *    ou la marge de sécurité qu'on veut garder au-dessus de la marque.
   */
  gap_mm: number;
  /** Éléments imprimés sur l'étiquette. */
  show_name: boolean;
  show_barcode: boolean;
  show_price: boolean;
  /** Affiche le prix remisé (barré + remisé) si l'article a une remise. */
  show_discount: boolean;
  /** Affiche la référence (SKU). */
  show_sku: boolean;
  /** Disposition (position + taille) de chaque élément (éditeur d'étiquette). */
  layout: LabelLayout;
  /**
   * Calage vertical de l'impression, en millimètres (négatif = vers le haut).
   *
   * Compense le décalage MÉCANIQUE de l'imprimante : selon le réglage du
   * capteur de gap et l'usure de l'entraînement, une même image peut se poser
   * quelques millimètres plus bas sur l'étiquette, laissant une marge haute
   * excessive et rognant le bas. Aucun logiciel ne peut le deviner — il se
   * mesure sur une étiquette imprimée, d'où ce réglage.
   *
   * N'affecte QUE l'impression thermique : l'aperçu montre la mise en page
   * telle qu'elle doit tomber sur l'étiquette une fois le calage juste.
   */
  print_offset_y_mm: number;
  /**
   * Calage HORIZONTAL de l'impression, en millimètres (négatif = vers la
   * gauche).
   *
   * Le média n'est pas toujours centré sous la tête : selon le guide-papier
   * et le rouleau, une même image se pose quelques millimètres de côté, et
   * le contenu sort d'un bord en laissant un blanc à l'autre. Comme le
   * calage vertical, il se mesure sur une étiquette sortie.
   */
  print_offset_x_mm: number;
}

export const LABEL_LAYOUT_DEFAULT: LabelLayout = {
  name:    { x: 0.5, y: 0.13, size: 1 },
  price:   { x: 0.5, y: 0.36, size: 1 },
  barcode: { x: 0.5, y: 0.68, size: 1 },
  sku:     { x: 0.5, y: 0.22, size: 1 },
};

export const LABEL_DEFAULTS: LabelSettings = {
  width_mm: 50,
  height_mm: 30,
  gap_mm: 3,
  show_name: true,
  show_barcode: true,
  show_price: true,
  show_discount: true,
  show_sku: false,
  layout: LABEL_LAYOUT_DEFAULT,
  print_offset_y_mm: 0,
  print_offset_x_mm: 0,
};

function clampMm(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(10, Math.round(n)));
}

/** Écart entre étiquettes : 0 admis (papier à marque noire, pas = hauteur). */
function clampGap(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(20, Math.max(0, Math.round(n * 10) / 10));
}

/** Calage borné : au-delà de ±15 mm on ne compense plus, on casse. */
function clampOffset(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(15, Math.max(-15, Math.round(n * 10) / 10));
}

function clamp01(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
function clampSize(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(3, Math.max(0.3, n));
}
function mergeEl(p: Partial<LabelElementLayout> | undefined, d: LabelElementLayout): LabelElementLayout {
  return { x: clamp01(p?.x, d.x), y: clamp01(p?.y, d.y), size: clampSize(p?.size, d.size) };
}
function mergeLayout(p: Partial<LabelLayout> | undefined): LabelLayout {
  return {
    name: mergeEl(p?.name, LABEL_LAYOUT_DEFAULT.name),
    price: mergeEl(p?.price, LABEL_LAYOUT_DEFAULT.price),
    barcode: mergeEl(p?.barcode, LABEL_LAYOUT_DEFAULT.barcode),
    sku: mergeEl(p?.sku, LABEL_LAYOUT_DEFAULT.sku),
  };
}

export function mergeLabelDefaults(partial: Partial<LabelSettings> | null | undefined): LabelSettings {
  if (!partial) return { ...LABEL_DEFAULTS, layout: mergeLayout(undefined) };
  return {
    width_mm: clampMm(partial.width_mm, LABEL_DEFAULTS.width_mm),
    height_mm: clampMm(partial.height_mm, LABEL_DEFAULTS.height_mm),
    gap_mm: clampGap(partial.gap_mm, LABEL_DEFAULTS.gap_mm),
    show_name: partial.show_name ?? LABEL_DEFAULTS.show_name,
    show_barcode: partial.show_barcode ?? LABEL_DEFAULTS.show_barcode,
    show_price: partial.show_price ?? LABEL_DEFAULTS.show_price,
    show_discount: partial.show_discount ?? LABEL_DEFAULTS.show_discount,
    show_sku: partial.show_sku ?? LABEL_DEFAULTS.show_sku,
    layout: mergeLayout(partial.layout),
    print_offset_y_mm: clampOffset(partial.print_offset_y_mm, LABEL_DEFAULTS.print_offset_y_mm),
    print_offset_x_mm: clampOffset(partial.print_offset_x_mm, LABEL_DEFAULTS.print_offset_x_mm),
  };
}
