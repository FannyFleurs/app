/**
 * Preuve et contenus éditoriaux : témoignages, cas clients, ressources.
 *
 * RÈGLE ABSOLUE — rien n'est inventé ici. Tant qu'un témoignage n'a pas été
 * recueilli et validé par le commerce concerné, il n'apparaît pas sur le
 * site. Les tableaux ci-dessous sont donc volontairement vides : la mise en
 * page correspondante est écrite et testée, elle s'affichera dès qu'un
 * contenu réel sera ajouté ici.
 *
 * Pour publier un témoignage : ajouter une entrée à TESTIMONIALS.
 * Pour publier un cas client : ajouter une entrée à CASES (le `slug` devient
 * l'URL /clients/<slug>, référencée automatiquement dans le plan du site).
 */

export interface Testimonial {
  /** Nom du commerce. */
  shop: string;
  city: string;
  activity: string;
  /** Personne citée, si elle accepte d'être nommée. */
  person?: { name: string; role: string };
  quote: string;
  /** Emplacement photo (voir lib/site/media.ts). */
  photoSlot?: string;
  /** Cas client détaillé associé, si publié. */
  caseSlug?: string;
}

export const TESTIMONIALS: Testimonial[] = [];

export interface CaseStudy {
  slug: string;
  shop: string;
  city: string;
  activity: string;
  /** Résumé affiché dans la liste. */
  summary: string;
  context: string[];
  challenge: string[];
  organisation: string[];
  /** Fonctions du produit réellement utilisées par ce commerce. */
  featuresUsed: string[];
  /** Captures illustrant le cas (captures produit réelles uniquement). */
  screens?: { src: string; alt: string }[];
  quote?: { text: string; author: string };
  /** Résultats mesurés et communiqués par le commerce. Jamais estimés. */
  results?: { label: string; value: string }[];
  photoSlot?: string;
}

export const CASES: CaseStudy[] = [];

export function caseBySlug(slug: string): CaseStudy | undefined {
  return CASES.find((c) => c.slug === slug);
}

/**
 * Ressources.
 *
 * `RESOURCE_TOPICS` décrit l'architecture éditoriale prévue ; `RESOURCES`
 * contient les articles publiés (aucun pour l'instant). Les pages déjà
 * écrites du site (conformité, matériel, questions fréquentes) sont
 * référencées comme ressources disponibles, parce qu'elles le sont.
 */
export interface ResourceTopic {
  slug: string;
  title: string;
  description: string;
}

export const RESOURCE_TOPICS: ResourceTopic[] = [
  { slug: 'guides', title: 'Guides', description: 'Prendre en main HelloPos, écran par écran.' },
  { slug: 'conseils', title: 'Conseils', description: 'Tenir un commerce : organisation, stocks, saisons.' },
  { slug: 'actualites', title: 'Actualités', description: 'Ce qui change dans le produit.' },
  { slug: 'conformite', title: 'Conformité', description: 'Vos obligations de caisse, expliquées simplement.' },
  { slug: 'materiel', title: 'Matériel', description: 'Choisir sa tablette, son imprimante, sa douchette.' },
  { slug: 'gestion', title: 'Gestion de commerce', description: 'Marges, inventaires, clôtures, comptabilité.' },
];

export interface Resource {
  slug: string;
  topic: string;
  title: string;
  excerpt: string;
  /** Date ISO de publication. */
  date: string;
  body: { h2?: string; p: string[] }[];
}

export const RESOURCES: Resource[] = [];

export function resourceBySlug(slug: string): Resource | undefined {
  return RESOURCES.find((r) => r.slug === slug);
}
