/**
 * Configuration de l'interface de caisse, persistée dans la table `settings`
 * sous la clé `pos_ui` (au niveau organisation).
 *
 * Cette structure est volontairement extensible : ajouter une nouvelle option
 * = (1) la déclarer ici dans DEFAULTS + le type, (2) la valider dans le schéma
 * zod côté API, (3) ajouter le contrôle dans la page de paramètres.
 */

export const POS_TILE_SIZES = ['compact', 'normal', 'large', 'xl'] as const;
export type PosTileSize = (typeof POS_TILE_SIZES)[number];

export interface PosUiSettings {
  tile_size: PosTileSize;
  show_product_image: boolean;
  show_category_badge: boolean;
  show_price: boolean;
  show_tax_badge: boolean;
}

export const POS_UI_KEY = 'pos_ui';

export const POS_UI_DEFAULTS: PosUiSettings = {
  tile_size: 'normal',
  show_product_image: true,
  show_category_badge: true,
  show_price: true,
  show_tax_badge: true,
};

/**
 * Métriques visuelles dérivées de la taille — utilisées par la grille de produits.
 * Tout est centralisé ici pour qu'un futur changement (ex : nouveau preset) ne
 * touche qu'un seul endroit.
 */
export interface PosTileMetrics {
  /** Classes Tailwind pour les colonnes de la grille (mobile → xl). */
  grid: string;
  /** Padding interne de la tuile. */
  padding: string;
  /** Taille du nom du produit. */
  titleFontSize: string;
  /** Hauteur minimale réservée au titre (lignes). */
  titleMinHeight: string;
  /** Taille du prix. */
  priceFontSize: string;
  /** Espacement vertical entre tuiles. */
  gap: string;
}

export function tileMetrics(size: PosTileSize): PosTileMetrics {
  switch (size) {
    case 'compact':
      return {
        grid: 'grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
        padding: 'p-2.5',
        titleFontSize: 'text-xs',
        titleMinHeight: 'min-h-[2rem]',
        priceFontSize: 'text-sm',
        gap: 'gap-2',
      };
    case 'normal':
      return {
        grid: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
        padding: 'p-4',
        titleFontSize: 'text-sm',
        titleMinHeight: 'min-h-[2.5rem]',
        priceFontSize: 'text-lg',
        gap: 'gap-3',
      };
    case 'large':
      return {
        grid: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-3',
        padding: 'p-5',
        titleFontSize: 'text-base',
        titleMinHeight: 'min-h-[3rem]',
        priceFontSize: 'text-xl',
        gap: 'gap-4',
      };
    case 'xl':
      return {
        grid: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2',
        padding: 'p-6',
        titleFontSize: 'text-lg',
        titleMinHeight: 'min-h-[3.5rem]',
        priceFontSize: 'text-2xl',
        gap: 'gap-4',
      };
  }
}

export const POS_TILE_SIZE_LABELS: Record<PosTileSize, { label: string; description: string }> = {
  compact: {
    label: 'Compact',
    description: 'Petites tuiles, jusqu\'à 6 colonnes — idéal pour très gros catalogue.',
  },
  normal: {
    label: 'Normal',
    description: 'Équilibré : 4 colonnes sur écran large.',
  },
  large: {
    label: 'Grand',
    description: 'Tuiles confortables, 3 colonnes — idéal pour iPad au comptoir.',
  },
  xl: {
    label: 'Très grand',
    description: 'Énormes tuiles tactiles, 2 colonnes — moins de fatigue visuelle.',
  },
};

/** Fusionne des valeurs partielles (lues en BDD) avec les défauts pour garantir une structure complète. */
export function mergeWithDefaults(partial: Partial<PosUiSettings> | null | undefined): PosUiSettings {
  if (!partial) return { ...POS_UI_DEFAULTS };
  const out = { ...POS_UI_DEFAULTS };
  for (const k of Object.keys(POS_UI_DEFAULTS) as (keyof PosUiSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error fusion homogène
      out[k] = partial[k];
    }
  }
  return out;
}
