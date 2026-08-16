import { SITE_URL } from '@/lib/site/meta';
import { isSitePublic } from '@/lib/site/publication';

/**
 * robots.txt.
 *
 * Écrit comme gestionnaire de route plutôt que comme fichier de métadonnées :
 * l'état de publication du site vit en base et doit être relu à chaque
 * requête. Un `app/robots.ts` classique est figé à la génération, ce qui
 * gèlerait le fichier dans l'état où se trouvait le site au moment du build.
 *
 * Site non publié : l'exploration reste autorisée — c'est ce qui permet aux
 * moteurs de lire le `noindex` de la page d'attente et de retirer les pages
 * de leurs résultats. Le plan du site, lui, n'est plus annoncé.
 */
export const dynamic = 'force-dynamic';

/** Espaces applicatifs : jamais explorés, publiés ou non. */
const APP_PATHS = ['/api/', '/caisse', '/dashboard', '/admin', '/bo', '/ecran', '/pda', '/login'];

export async function GET() {
  const published = await isSitePublic();
  const disallow = published ? [...APP_PATHS, '/setup', '/connexion'] : [...APP_PATHS, '/setup'];

  const lines = [
    'User-Agent: *',
    'Allow: /',
    ...disallow.map((p) => `Disallow: ${p}`),
    '',
    `Host: ${SITE_URL}`,
    ...(published ? [`Sitemap: ${SITE_URL}/sitemap.xml`] : []),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
