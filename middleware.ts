import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routage par sous-domaine :
 *
 *   domaine.com        -> site vitrine (marketing, tarifs, CTA)
 *   app.domaine.com    -> caisse (POS), comportement standard de l'app
 *   bo.domaine.com     -> back-office (gestion accessible partout,
 *                          connexion email + mot de passe admin)
 *   ca.domaine.com     -> suivi du CA en direct (dashboard chiffre
 *                          d'affaires distant)
 *   admin.domaine.com  -> console super-admin SaaS (cross-tenant)
 *
 * Fallbacks path-based pour la periode ou le domaine custom n'est
 * pas encore configure (env Vercel *.vercel.app) :
 *
 *   /bo                pose le cookie webpos_bo=1 et redirige vers
 *                       /dashboard (back-office).
 *   /bo/exit           supprime le cookie et redirige vers /caisse.
 *   /site              route vitrine accessible depuis n'importe ou
 *                       (fallback pour Vercel URL).
 *
 * Sur les hosts *.vercel.app on ne rewrite rien vers la vitrine par
 * defaut : la Vercel URL reste "l'app" (comme aujourd'hui). Une fois
 * le vrai domaine branche, la vitrine sera automatiquement servie a
 * la racine du bare domain.
 */
const BO_COOKIE = 'webpos_bo';

function isVercelPreview(host: string): boolean {
  return host.endsWith('.vercel.app') || host === 'localhost' || host.startsWith('localhost:');
}

function normalizeHost(host: string): string {
  // Retire le port pour matcher plus proprement en dev
  return host.split(':')[0] ?? host;
}

export function middleware(req: NextRequest) {
  const rawHost = (req.headers.get('host') ?? '').toLowerCase();
  const host = normalizeHost(rawHost);
  const url = req.nextUrl.clone();

  // Assets statiques et endpoints API : toujours pass-through (les
  // sous-domaines partagent la meme base d'API, on n'y touche pas).
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next') ||
    url.pathname.startsWith('/icons') ||
    url.pathname === '/favicon.ico' ||
    url.pathname === '/manifest.json'
  ) {
    return NextResponse.next();
  }

  // -------- 1) Sous-domaine ca. -> rewrite vers /ca
  if (host.startsWith('ca.')) {
    if (url.pathname.startsWith('/ca')) return NextResponse.next();
    url.pathname = '/ca' + (url.pathname === '/' ? '' : url.pathname);
    return NextResponse.rewrite(url);
  }

  // -------- 2) Sous-domaine admin. -> rewrite vers /admin
  if (host.startsWith('admin.')) {
    if (url.pathname.startsWith('/admin')) return NextResponse.next();
    url.pathname = '/admin' + (url.pathname === '/' ? '' : url.pathname);
    return NextResponse.rewrite(url);
  }

  // -------- 3) Sortie du back-office
  if (url.pathname === '/bo/exit' || url.pathname === '/bo-exit') {
    url.pathname = '/caisse';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  // -------- 4) Page de connexion back-office (fallback path)
  if (url.pathname === '/bo/login') {
    const res = NextResponse.next();
    res.cookies.set(BO_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  // -------- 5) Point d'entree /bo (fallback path)
  if (url.pathname === '/bo' || url.pathname === '/bo/') {
    url.pathname = '/dashboard';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  // -------- 6) Mode back-office actif (via sous-domaine bo. ou cookie)
  const inBackOffice =
    host.startsWith('bo.') || req.cookies.get(BO_COOKIE)?.value === '1';

  if (inBackOffice) {
    if (url.pathname === '/caisse' || url.pathname.startsWith('/caisse/')) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-webpos-bo', '1');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // -------- 7) Sous-domaine app. -> comportement app standard
  if (host.startsWith('app.')) {
    return NextResponse.next();
  }

  // -------- 8) Site vitrine :
  //   - Sur un vrai domaine bare (pas app./bo./ca./admin. et pas
  //     *.vercel.app), la racine "/" affiche la vitrine.
  //   - Route explicite /site accessible depuis n'importe ou.
  const wantsLanding =
    url.pathname === '/site' ||
    (url.pathname === '/' && !isVercelPreview(host));

  if (wantsLanding) {
    if (url.pathname !== '/site') {
      url.pathname = '/site';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
