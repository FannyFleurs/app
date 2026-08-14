import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/meta';

/**
 * robots.txt : autorise l'exploration du site vitrine, exclut les espaces
 * applicatifs (caisse, back-office, admin, API…).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/caisse', '/dashboard', '/admin', '/bo', '/ecran', '/pda', '/login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
