/**
 * Configuration de l'interface de caisse, persistée dans la table `settings`
 * sous la clé `pos_ui` (au niveau organisation).
 *
 * Cette structure est volontairement extensible : ajouter une nouvelle option
 * = (1) la déclarer ici dans DEFAULTS + le type, (2) la valider dans le schéma
 * zod côté API, (3) ajouter le contrôle dans la page de paramètres.
 */

export const POS_TILE_SIZES = ['mini', 'dense', 'compact', 'normal', 'large', 'xl'] as const;
export type PosTileSize = (typeof POS_TILE_SIZES)[number];

/** Thème de la marque : imposé partout où l'on gère (back-office, PDA, CA, admin). */
export const BRAND_THEME = 'hellopos' as const;

export const POS_THEME_COLORS = ['hellopos', 'sage', 'charcoal', 'navy', 'terracotta', 'rose', 'amber', 'plum', 'emerald', 'teal', 'bordeaux', 'lavender'] as const;
export type PosThemeColor = (typeof POS_THEME_COLORS)[number];

/**
 * Couleur d'accent choisie AU POSTE (par appareil), mémorisée en localStorage.
 * Prime sur la couleur de l'organisation : chaque caisse peut avoir la sienne.
 */
// Plus de couleur d'accent par poste : l'habillage est celui de la marque.
// Un réglage enregistré autrefois n'a plus d'effet — on ne le lit plus.

export const OPENING_FLOAT_MODES = ['manual', 'fixed', 'previous_close'] as const;
export type OpeningFloatMode = (typeof OPENING_FLOAT_MODES)[number];

export const AUTO_LOGOUT_MODES = ['never', 'after_sale', 'timer'] as const;
export type AutoLogoutMode = (typeof AUTO_LOGOUT_MODES)[number];

export const COLOR_SCHEMES = ['light', 'dark', 'system'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export interface WalletPassSettings {
  /** Active la génération de cartes fidélité Apple Wallet. */
  enabled: boolean;
  /**
   * Pass Type Identifier declare sur developer.apple.com (ex.
   * "pass.fr.webpos.loyalty"). L'infrastructure serveur signe les
   * .pkpass avec le certificat correspondant.
   */
  pass_type_id: string;
  /** Team ID Apple (10 caracteres, en haut a droite du portail). */
  team_id: string;
  /** Texte du logo en haut a gauche du pass. Defaut = nom boutique. */
  logo_text: string;
  /** Libelle du champ principal (defaut : "Solde fidelite"). */
  primary_label: string;
  /** Couleur de fond du pass en #RRGGBB. Defaut = couleur d'accent theme. */
  background_color: string;
  /** Couleur du texte du pass en #RRGGBB. Defaut = blanc chaud. */
  foreground_color: string;
  /** Afficher les champs secondaires du pass. */
  show_points: boolean;
  show_tier: boolean;
  show_since: boolean;
  /** Message optionnel affiche au verso du pass. */
  back_message: string;
}

/**
 * Périmètre de la fidélité (offre Croissance+) :
 *   - 'shared'    : une carte commune à TOUTES les boutiques (défaut).
 *   - 'per_store' : chaque boutique a sa propre carte (soldes séparés).
 *   - 'grouped'   : groupes personnalisés — les boutiques d'un même groupe
 *                   partagent la carte ; une boutique non assignée a la sienne.
 */
export type LoyaltyScope = 'shared' | 'per_store' | 'grouped';

export interface LoyaltySettings {
  enabled: boolean;
  euros_earned: number;      // ex 5 : on gagne 5 € de fidélité
  per_euros_spent: number;   // ex 100 : tous les 100 € dépensés
  min_redeem: number;        // seuil mini d'utilisation (ex 5 €)
  stackable: boolean;        // cumulable avec d'autres remises ?
  on_excluded_categories: string[];
  /** Périmètre (multi-boutiques) — voir LoyaltyScope. Défaut 'shared'. */
  scope: LoyaltyScope;
  /** Mode 'grouped' : boutique (store_id) -> identifiant de groupe. */
  store_groups: Record<string, string>;
  /** Carte fidelite Apple Wallet (facultatif). */
  wallet: WalletPassSettings;
}

/**
 * Clé du groupe fidélité pour une boutique donnée. Les comptes fidélité
 * sont cloisonnés par cette clé. '*' = groupe commun (toutes boutiques).
 */
export function loyaltyGroupKey(
  loyalty: { scope?: LoyaltyScope; store_groups?: Record<string, string> } | null | undefined,
  storeId: string | null | undefined,
): string {
  const scope = loyalty?.scope ?? 'shared';
  if (scope === 'shared' || !storeId) return '*';
  if (scope === 'per_store') return `s:${storeId}`;
  // grouped : groupe assigné, sinon la boutique constitue son propre groupe.
  const g = loyalty?.store_groups?.[storeId];
  return g ? `g:${g}` : `s:${storeId}`;
}

export interface PosUiSettings {
  tile_size: PosTileSize;
  theme_color: PosThemeColor;
  color_scheme: ColorScheme;
  show_product_image: boolean;
  show_category_badge: boolean;
  show_price: boolean;
  show_tax_badge: boolean;
  opening_float_mode: OpeningFloatMode;
  opening_float_amount: number;
  loyalty: LoyaltySettings;
  hidden_sidebar_paths: string[];
  auto_logout_mode: AutoLogoutMode;
  auto_logout_minutes: number;
  /** Onglets affichés dans la barre supérieure (max 10). Si vide → défaut. */
  header_tabs: string[];
}

/** Limite dure d'onglets dans le header (au-delà ça déborde visuellement). */
export const HEADER_TABS_MAX = 10;

/** Onglets par défaut affichés dans la barre supérieure. */
export const HEADER_TABS_DEFAULT: string[] = [
  '/caisse',
  '/orders',
  '/ma-journee',
  '/products',
  '/stock',
  '/vouchers',
  '/customers',
];

export const OPENING_FLOAT_LABELS: Record<OpeningFloatMode, { label: string; description: string }> = {
  manual: {
    label: 'Saisie manuelle',
    description: 'Le caissier saisit le fond de caisse à chaque ouverture.',
  },
  fixed: {
    label: 'Montant fixe',
    description: 'On part toujours du même montant (champ ci-dessous).',
  },
  previous_close: {
    label: 'Solde de la veille',
    description: "Reprend le montant compté à la dernière clôture. Pratique si la caisse n'est pas vidée chaque soir.",
  },
};

export const POS_UI_KEY = 'pos_ui';

export const POS_UI_DEFAULTS: PosUiSettings = {
  tile_size: 'normal',
  theme_color: 'hellopos',
  color_scheme: 'light',
  show_product_image: true,
  show_category_badge: true,
  show_price: true,
  show_tax_badge: true,
  opening_float_mode: 'manual',
  opening_float_amount: 0,
  loyalty: {
    enabled: false,
    euros_earned: 5,
    per_euros_spent: 100,
    min_redeem: 5,
    stackable: false,
    on_excluded_categories: [],
    scope: 'shared',
    store_groups: {},
    wallet: {
      enabled: false,
      pass_type_id: '',
      team_id: '',
      logo_text: '',
      primary_label: 'Solde fidélité',
      background_color: '#556B3E',
      foreground_color: '#F5F1E8',
      show_points: true,
      show_tier: false,
      show_since: true,
      back_message: '',
    },
  },
  hidden_sidebar_paths: [],
  auto_logout_mode: 'never',
  auto_logout_minutes: 10,
  header_tabs: HEADER_TABS_DEFAULT,
};

export const POS_THEME_COLOR_VALUES: Record<PosThemeColor, { label: string; main: string; deep: string; soft: string }> = {
  // Couleurs de la marque : c'est le thème par défaut, les autres restent
  // proposés à qui veut habiller sa caisse autrement.
  hellopos:   { label: 'HelloPos',   main: '#013E37', deep: '#012B26', soft: '#FFEFB3' },
  sage:       { label: 'Sauge',      main: '#5C6F5D', deep: '#45543F', soft: '#EDF1ED' },
  charcoal:   { label: 'Anthracite', main: '#2A2F33', deep: '#15191C', soft: '#EEEEF0' },
  navy:       { label: 'Bleu nuit',  main: '#1F3A5F', deep: '#15294A', soft: '#E6EDF6' },
  terracotta: { label: 'Terracotta', main: '#B5683E', deep: '#8E4F2F', soft: '#F7EAE0' },
  rose:       { label: 'Rose poudré',main: '#B85C5C', deep: '#8E4040', soft: '#F8E8E8' },
  amber:      { label: 'Ambre',      main: '#B7791F', deep: '#8E5B15', soft: '#F7EFD7' },
  plum:       { label: 'Prune',      main: '#7A3C6E', deep: '#5C2C53', soft: '#F1E4EE' },
  emerald:    { label: 'Émeraude',   main: '#1E7A5E', deep: '#155C46', soft: '#E4F2EC' },
  teal:       { label: 'Océan',      main: '#0E7490', deep: '#0B5B70', soft: '#E1EFF3' },
  bordeaux:   { label: 'Bordeaux',   main: '#7B2D3A', deep: '#5D2029', soft: '#F3E4E7' },
  lavender:   { label: 'Lavande',    main: '#6D5D9C', deep: '#524879', soft: '#ECE9F4' },
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
  /** Diamètre de l'icône de catégorie, en pixels — suit la taille des tuiles. */
  iconSize: number;
}

export function tileMetrics(size: PosTileSize): PosTileMetrics {
  switch (size) {
    case 'mini':
      return {
        grid: 'grid-cols-4 md:grid-cols-6 xl:grid-cols-8',
        padding: 'p-1.5',
        titleFontSize: 'text-[11px]',
        titleMinHeight: 'min-h-[1.75rem]',
        priceFontSize: 'text-xs',
        gap: 'gap-1.5',
        iconSize: 24,
      };
    case 'dense':
      return {
        grid: 'grid-cols-3 md:grid-cols-6 xl:grid-cols-6',
        padding: 'p-2',
        titleFontSize: 'text-xs',
        titleMinHeight: 'min-h-[2rem]',
        priceFontSize: 'text-sm',
        gap: 'gap-2',
        iconSize: 28,
      };
    case 'compact':
      return {
        grid: 'grid-cols-3 md:grid-cols-4 xl:grid-cols-6',
        padding: 'p-2.5',
        titleFontSize: 'text-xs',
        titleMinHeight: 'min-h-[2rem]',
        priceFontSize: 'text-sm',
        gap: 'gap-2',
        iconSize: 32,
      };
    case 'normal':
      return {
        grid: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
        padding: 'p-4',
        titleFontSize: 'text-sm',
        titleMinHeight: 'min-h-[2.5rem]',
        priceFontSize: 'text-lg',
        gap: 'gap-3',
        iconSize: 40,
      };
    case 'large':
      return {
        grid: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-3',
        padding: 'p-5',
        titleFontSize: 'text-base',
        titleMinHeight: 'min-h-[3rem]',
        priceFontSize: 'text-xl',
        gap: 'gap-4',
        iconSize: 48,
      };
    case 'xl':
      return {
        grid: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2',
        padding: 'p-6',
        titleFontSize: 'text-lg',
        titleMinHeight: 'min-h-[3.5rem]',
        priceFontSize: 'text-2xl',
        gap: 'gap-4',
        iconSize: 56,
      };
  }
}

export const POS_TILE_SIZE_LABELS: Record<PosTileSize, { label: string; description: string }> = {
  mini: {
    label: 'Mini',
    description: 'Très petites tuiles, jusqu\'à 8 colonnes — catalogue très dense.',
  },
  dense: {
    label: 'Dense',
    description: '6 tuiles par ligne — intermédiaire entre Mini et Compact.',
  },
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
  if (!partial) return { ...POS_UI_DEFAULTS, loyalty: { ...POS_UI_DEFAULTS.loyalty, wallet: { ...POS_UI_DEFAULTS.loyalty.wallet } } };
  const out = { ...POS_UI_DEFAULTS };
  for (const k of Object.keys(POS_UI_DEFAULTS) as (keyof PosUiSettings)[]) {
    if (partial[k] !== undefined) {
      // @ts-expect-error fusion homogène
      out[k] = partial[k];
    }
  }
  // Deep-merge loyalty.wallet pour eviter la perte des defauts quand un
  // ancien pos_ui n'a pas encore ce sous-objet.
  out.loyalty = {
    ...POS_UI_DEFAULTS.loyalty,
    ...(partial.loyalty ?? {}),
    wallet: {
      ...POS_UI_DEFAULTS.loyalty.wallet,
      ...(partial.loyalty?.wallet ?? {}),
    },
  };
  return out;
}
