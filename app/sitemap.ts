import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/meta';

/** Plan du site : pages publiques du site vitrine. */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ['', '/fonctionnalites', '/tarifs', '/avis', '/conformite', '/contact', '/mentions-legales', '/confidentialite'];
  return paths.map((p) => ({
    url: `${SITE_URL}${p || '/'}`,
    changeFrequency: 'monthly',
    priority: p === '' ? 1 : 0.7,
  }));
}
