import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route les requetes des sous-domaines vers l'espace applicatif adapte.
 *
 * - "ca."  -> espace CA en direct (rewrite transparent vers /ca)
 * - "bo."  -> back-office (memes pages que le principal, sans caisse,
 *             sidebar en mode "menu complet"). On n'utilise pas de
 *             route dediee /bo : on reutilise les memes pages (app)
 *             et on injecte un header requete `x-webpos-bo=1` que le
 *             layout serveur lit pour adapter la sidebar / masquer la
 *             caisse. En bonus, /caisse est redirigee vers /dashboard.
 *
 * Sur les autres hosts (webpos.fr, admin.webpos.fr...) : aucune reecriture.
 */
export function middleware(req: NextRequest) {
  const host = req.headers.get('host')?.toLowerCase() ?? '';

  if (host.startsWith('ca.')) {
    const url = req.nextUrl.clone();
    if (url.pathname.startsWith('/ca') || url.pathname.startsWith('/api/ca')) {
      return NextResponse.next();
    }
    if (url.pathname.startsWith('/api/')) return NextResponse.next();
    if (url.pathname.startsWith('/_next') || url.pathname.startsWith('/icons')
        || url.pathname === '/favicon.ico' || url.pathname === '/manifest.json') {
      return NextResponse.next();
    }
    url.pathname = '/ca' + (url.pathname === '/' ? '' : url.pathname);
    return NextResponse.rewrite(url);
  }

  if (host.startsWith('bo.')) {
    const url = req.nextUrl.clone();
    // Racine du back-office -> tableau de bord
    if (url.pathname === '/') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    // La caisse n'a aucun sens en back-office : redirige vers le dashboard
    if (url.pathname === '/caisse' || url.pathname.startsWith('/caisse/')) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    // Injecte un header requete que le layout serveur lit pour adapter
    // la sidebar / masquer /caisse. NextResponse.next({request:{headers}})
    // remplace les entetes de la requete propagees aux handlers.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-webpos-bo', '1');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
