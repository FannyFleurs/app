import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/meta';
import { allMarketingPaths } from '@/lib/site/routes';
import { CASES, RESOURCES } from '@/lib/site/content/showcase';
import { SITE_PUBLIC } from '@/lib/site/publication';

/**
 * Plan du site : toutes les pages publiques, construites depuis la même
 * source que le routage (lib/site/routes.ts). Les pages sans intérêt pour
 * l'indexation — l'aiguillage de connexion — en sont exclues.
 *
 * `force-dynamic` : l'état de publication est relu à la requête plutôt que
 * figé au moment de la génération.
 */
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  // Site dépublié : aucune URL à proposer aux moteurs.
  if (!SITE_PUBLIC) return [];

  const lastModified = new Date();
  const paths = [
    ...allMarketingPaths().filter((p) => p !== '/connexion'),
    ...CASES.map((c) => `/clients/${c.slug}`),
    ...RESOURCES.map((r) => `/ressources/${r.slug}`),
  ];

  return paths.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/tarifs' || path === '/fonctionnalites' ? 0.9 : 0.7,
  }));
}
