/**
 * Cartographie des URLs publiques du site hellopos.fr.
 *
 * Source unique de vérité partagée par :
 *  - le middleware (réécriture des URLs propres `/tarifs` → `/site/tarifs`) ;
 *  - le plan du site (`app/sitemap.ts`) ;
 *  - la navigation (en-tête, pied de page, fils d'Ariane).
 *
 * Toute nouvelle page marketing doit être déclarée ici, sinon elle ne sera
 * ni servie à l'apex, ni référencée dans le sitemap.
 */

/** Métiers disposant d'une page « solution » et d'une page SEO dédiée. */
export const TRADE_SLUGS = [
  'fleuristes',
  'cavistes',
  'jardineries',
  'concept-stores',
  'epiceries',
] as const;

export type TradeSlug = (typeof TRADE_SLUGS)[number];

/** Correspondance métier → page SEO « logiciel de caisse pour … ». */
export const SEO_PATH_BY_TRADE: Record<TradeSlug, string> = {
  fleuristes: '/logiciel-caisse-fleuriste',
  cavistes: '/logiciel-caisse-caviste',
  jardineries: '/logiciel-caisse-jardinerie',
  'concept-stores': '/logiciel-caisse-concept-store',
  epiceries: '/logiciel-caisse-epicerie',
};

/** Pages fixes (une route = un fichier `page.tsx`). */
export const STATIC_MARKETING_PATHS = [
  '/',
  '/fonctionnalites',
  '/tarifs',
  '/materiel',
  '/conformite',
  '/solutions',
  '/clients',
  '/ressources',
  '/a-propos',
  '/contact',
  '/support',
  '/connexion',
  '/mentions-legales',
  '/confidentialite',
] as const;

/** Toutes les URLs publiques, y compris les pages métier et SEO. */
export function allMarketingPaths(): string[] {
  return [
    ...STATIC_MARKETING_PATHS,
    ...TRADE_SLUGS.map((t) => `/solutions/${t}`),
    ...TRADE_SLUGS.map((t) => SEO_PATH_BY_TRADE[t]),
  ];
}

/**
 * Préfixes servis par le site vitrine (sections à contenu dynamique :
 * `/clients/<slug>`, `/ressources/<slug>`…).
 */
const MARKETING_PREFIXES = ['/solutions/', '/clients/', '/ressources/', '/logiciel-caisse-'];

const EXACT = new Set<string>(STATIC_MARKETING_PATHS.filter((p) => p !== '/'));

/**
 * Vrai si le chemin appartient au site vitrine (hors racine, traitée à part
 * par le middleware). Utilisé pour réécrire `/tarifs` → `/site/tarifs`.
 */
export function isMarketingPath(pathname: string): boolean {
  if (EXACT.has(pathname)) return true;
  return MARKETING_PREFIXES.some((p) => pathname.startsWith(p));
}
