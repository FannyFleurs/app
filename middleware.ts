import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route les requetes du sous-domaine "ca." vers l'espace /ca de l'app
 * (dashboard chiffre d'affaires en direct). Le rewrite est transparent
 * cote client : l'URL affichee reste https://ca.exemple.com/…
 *
 * ex : ca.webpos.fr/          -> /ca
 *      ca.webpos.fr/login     -> /ca/login
 *      ca.webpos.fr/api/foo   -> passe direct (voir matcher plus bas)
 *
 * Sur les autres hosts (webpos.fr, admin.webpos.fr...) : aucune reecriture.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get('host')?.toLowerCase() ?? '';
  if (!host.startsWith('ca.')) return NextResponse.next();

  const url = req.nextUrl.clone();
  // Deja sous /ca ou /api/ca -> ne rien faire (evite double-prefix).
  if (url.pathname.startsWith('/ca') || url.pathname.startsWith('/api/ca')) {
    return NextResponse.next();
  }
  // Les autres routes /api restent accessibles telles quelles (login,
  // logout, session partagees avec le site principal).
  if (url.pathname.startsWith('/api/')) return NextResponse.next();
  // Assets statiques Next intacts.
  if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/icons')
      || url.pathname === '/favicon.ico' || url.pathname === '/manifest.json') {
    return NextResponse.next();
  }

  url.pathname = '/ca' + (url.pathname === '/' ? '' : url.pathname);
  return NextResponse.rewrite(url);
}

export const config = {
  // On matche toutes les routes non-statiques ; le middleware court-circuite
  // rapidement pour les hosts != "ca.".
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
