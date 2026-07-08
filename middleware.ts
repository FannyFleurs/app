import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route les requetes des sous-domaines vers l'espace applicatif adapte.
 *
 * - "ca."      -> espace CA en direct (rewrite transparent vers /ca)
 * - "bo."      -> back-office : pas de rewrite, on injecte simplement
 *                 le header requete `x-webpos-bo=1` que le layout
 *                 serveur lit. La caisse est redirigee vers /dashboard.
 * - /bo (path) -> point d'entree du back-office quand le sous-domaine
 *                 n'est pas encore configure (Vercel default URL par
 *                 exemple). On pose un cookie `webpos_bo=1` et on
 *                 redirige vers /dashboard. A partir de la, toute
 *                 requete du navigateur est traitee comme back-office.
 * - /bo/exit   -> supprime le cookie, retour a la caisse.
 *
 * Sur les autres hosts et sans cookie : aucune reecriture.
 */
const BO_COOKIE = 'webpos_bo';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host')?.toLowerCase() ?? '';
  const url = req.nextUrl.clone();

  // Sous-domaine CA. — rewrite transparent
  if (host.startsWith('ca.')) {
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

  // Sortie du back-office : supprime le cookie, retour a la caisse.
  if (url.pathname === '/bo/exit' || url.pathname === '/bo-exit') {
    url.pathname = '/caisse';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  // Point d'entree /bo (chemin) : pose le cookie et va au tableau de
  // bord. Sert de fallback quand le sous-domaine bo. n'est pas encore
  // configure (env Vercel *.vercel.app).
  if (url.pathname === '/bo' || url.pathname === '/bo/') {
    url.pathname = '/dashboard';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 jours
    });
    return res;
  }

  const inBackOffice =
    host.startsWith('bo.') || req.cookies.get(BO_COOKIE)?.value === '1';

  if (inBackOffice) {
    // La caisse n'a aucun sens en back-office : redirige vers le dashboard
    if (url.pathname === '/caisse' || url.pathname.startsWith('/caisse/')) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    // Injecte un header requete que le layout serveur lit pour adapter
    // la sidebar / masquer /caisse.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-webpos-bo', '1');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
