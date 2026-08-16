import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site/meta';
import { SITE_PUBLIC } from '@/lib/site/publication';

/**
 * robots.txt : le site public est explorable, les espaces applicatifs et
 * l'assistant de création de compte ne le sont pas.
 *
 * Site dépublié : l'exploration reste autorisée — c'est ce qui permet aux
 * moteurs de lire le `noindex` de la page d'attente et de retirer les pages
 * de leurs résultats. Le plan du site, lui, n'est plus annoncé.
 *
 * `force-dynamic` : l'état de publication est relu à la requête plutôt que
 * figé au moment de la génération.
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  if (!SITE_PUBLIC) {
    return {
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/caisse', '/dashboard', '/admin', '/bo', '/ecran', '/pda', '/login', '/setup'],
      },
      host: SITE_URL,
    };
  }
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
