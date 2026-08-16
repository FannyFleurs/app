import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/meta';

/**
 * robots.txt : le site public est explorable, les espaces applicatifs et
 * l'assistant de création de compte ne le sont pas.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/caisse',
        '/dashboard',
        '/admin',
        '/bo',
        '/ecran',
        '/pda',
        '/login',
        '/setup',
        '/connexion',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
