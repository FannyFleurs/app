import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routage par sous-domaine :
 *
 *   hellopos.fr        -> site vitrine (marketing, tarifs, CTA)
 *   app.hellopos.fr    -> caisse (POS)
 *   bo.hellopos.fr     -> back-office (email + mot de passe)
 *   ca.hellopos.fr     -> suivi du CA en direct
 *   ecran.hellopos.fr  -> écran atelier (email + mot de passe, mural)
 *   admin.hellopos.fr  -> console super-admin SaaS
 *
 * Sur un VRAI domaine (pas *.vercel.app), le routing est STRICT :
 *   - l'apex (hellopos.fr / www) ne sert QUE la vitrine ; tout chemin
 *     applicatif est redirige vers app.<domaine>.
 *   - www.<domaine> est redirige vers l'apex (canonique).
 *
 * Sur *.vercel.app / localhost (pas de sous-domaines), on garde des
 * fallbacks path-based pour pouvoir tester :
 *   - /bo        pose le cookie webpos_bo=1 et va au back-office
 *   - /bo/exit   supprime le cookie
 *   - /site      affiche la vitrine
 */
const BO_COOKIE = 'webpos_bo';
const KNOWN_SUBS = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'ecran.', 'www.'];

function isVercelPreview(host: string): boolean {
  return host.endsWith('.vercel.app') || host === 'localhost' || host.startsWith('localhost:');
}

function normalizeHost(host: string): string {
  return host.split(':')[0] ?? host;
}

/** Domaine racine : retire un prefixe de sous-domaine connu s'il existe. */
function baseDomain(host: string): string {
  for (const s of KNOWN_SUBS) if (host.startsWith(s)) return host.slice(s.length);
  return host;
}

function isStaticOrApi(pathname: string): boolean {
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/manifest') // /manifest.json ET /manifest-ca.json
  );
}

/**
 * Pages du site vitrine, servies sous /site/*. L'apex les expose à des URLs
 * propres (hellopos.fr/tarifs → /site/tarifs) ; les captures et autres assets
 * du site vivent sous /site/… et passent tels quels.
 */
const MARKETING_PATHS = new Set(['/fonctionnalites', '/tarifs', '/avis', '/conformite', '/contact']);
function isSitePath(pathname: string): boolean {
  return pathname === '/site' || pathname.startsWith('/site/');
}

export function middleware(req: NextRequest) {
  const host = normalizeHost((req.headers.get('host') ?? '').toLowerCase());
  const url = req.nextUrl.clone();
  const { pathname } = url;

  // Assets statiques + API : toujours pass-through (API partagee par
  // tous les sous-domaines).
  if (isStaticOrApi(pathname)) return NextResponse.next();

  // -------- ca. -> rewrite /ca
  if (host.startsWith('ca.')) {
    if (pathname.startsWith('/ca')) return NextResponse.next();
    url.pathname = '/ca' + (pathname === '/' ? '' : pathname);
    return NextResponse.rewrite(url);
  }

  // -------- pda. -> station d'impression d'étiquettes (PDA)
  // Sous-domaine mono-usage : tout est réécrit vers /pda, sauf le login PIN
  // (mêmes identifiants que la caisse). Après connexion, la caisse redirige
  // vers /caisse qui est ici réécrit en /pda.
  if (host.startsWith('pda.')) {
    if (pathname === '/login') return NextResponse.next();
    if (pathname === '/pda' || pathname.startsWith('/pda/')) return NextResponse.next();
    url.pathname = '/pda';
    return NextResponse.rewrite(url);
  }

  // -------- ecran. -> écran atelier (tablette murale)
  // Sous-domaine mono-usage : tout est réécrit vers /ecran, sauf la connexion,
  // qui se fait à l'email de l'organisation — donc le formulaire du
  // back-office, jamais le login PIN de la caisse.
  if (host.startsWith('ecran.')) {
    if (pathname === '/login' || pathname === '/bo/login') {
      if (pathname !== '/bo/login') {
        url.pathname = '/bo/login';
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }
    if (pathname === '/ecran' || pathname.startsWith('/ecran/')) return NextResponse.next();
    url.pathname = '/ecran';
    return NextResponse.rewrite(url);
  }

  // -------- admin. -> rewrite /admin
  if (host.startsWith('admin.')) {
    // Login super-admin : email + mot de passe (comme le back-office),
    // PAS le login PIN caisse. Le layout /admin redirige les visiteurs
    // non connectes vers /login ; sur ce sous-domaine on sert donc la
    // page /bo/login (formulaire email). Sans ca, /login etait reecrit
    // en /admin/login -> page inexistante -> 404.
    if (pathname === '/login' || pathname === '/bo/login') {
      if (pathname !== '/bo/login') {
        url.pathname = '/bo/login';
        return NextResponse.rewrite(url);
      }
      return NextResponse.next();
    }
    if (pathname.startsWith('/admin')) return NextResponse.next();
    url.pathname = '/admin' + (pathname === '/' ? '' : pathname);
    return NextResponse.rewrite(url);
  }

  // ================================================================
  // VRAI DOMAINE (hellopos.fr…) : routing strict par sous-domaine.
  // ================================================================
  if (!isVercelPreview(host)) {
    const base = baseDomain(host);

    // www.<domaine> -> apex (canonique)
    if (host.startsWith('www.')) {
      const to = url.clone();
      to.host = base;
      return NextResponse.redirect(to);
    }

    // bo.<domaine> -> back-office
    if (host.startsWith('bo.')) {
      // Racine -> tableau de bord (si non connecte, le layout (app)
      // redirigera vers /bo/login grace au header x-webpos-bo).
      if (pathname === '/') {
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
      // Login : on force le login back-office (email + mot de passe),
      // PAS le login PIN caisse.
      if (pathname === '/login') {
        url.pathname = '/bo/login';
        return NextResponse.redirect(url);
      }
      // La caisse n'existe pas en back-office.
      if (pathname === '/caisse' || pathname.startsWith('/caisse/')) {
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
      }
      const h = new Headers(req.headers);
      h.set('x-webpos-bo', '1');
      return NextResponse.next({ request: { headers: h } });
    }

    // app.<domaine> -> caisse (comportement app standard)
    if (host.startsWith('app.')) {
      return NextResponse.next();
    }

    // apex (hellopos.fr) -> UNIQUEMENT la vitrine + onboarding.
    // La racine affiche la vitrine ; /site et /setup restent servis ;
    // tout le reste (caisse, dashboard, login…) part sur app.<domaine>.
    if (pathname === '/') {
      url.pathname = '/site';
      return NextResponse.rewrite(url);
    }
    // URLs propres du site vitrine (hellopos.fr/tarifs…) → /site/tarifs.
    if (MARKETING_PATHS.has(pathname)) {
      url.pathname = '/site' + pathname;
      return NextResponse.rewrite(url);
    }
    // /site/* (accès direct + captures) et /setup servis tels quels.
    if (isSitePath(pathname) || pathname === '/setup' || pathname.startsWith('/setup/')) {
      return NextResponse.next();
    }
    const to = url.clone();
    to.host = `app.${base}`;
    return NextResponse.redirect(to);
  }

  // ================================================================
  // *.vercel.app / localhost : fallbacks path-based (tests).
  // ================================================================

  // Site vitrine : URLs propres → /site/* (comme sur l'apex réel), pour que
  // la navigation du site fonctionne aussi en local / preview.
  if (MARKETING_PATHS.has(pathname)) {
    url.pathname = '/site' + pathname;
    return NextResponse.rewrite(url);
  }

  // Sortie du back-office
  if (pathname === '/bo/exit' || pathname === '/bo-exit') {
    url.pathname = '/caisse';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  }

  // Page de connexion back-office (pose le cookie)
  if (pathname === '/bo/login') {
    const res = NextResponse.next();
    res.cookies.set(BO_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  // Point d'entree /bo
  if (pathname === '/bo' || pathname === '/bo/') {
    url.pathname = '/dashboard';
    const res = NextResponse.redirect(url);
    res.cookies.set(BO_COOKIE, '1', { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 });
    return res;
  }

  // Mode back-office actif via cookie
  if (req.cookies.get(BO_COOKIE)?.value === '1') {
    if (pathname === '/') {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    if (pathname === '/login') {
      url.pathname = '/bo/login';
      return NextResponse.redirect(url);
    }
    if (pathname === '/caisse' || pathname.startsWith('/caisse/')) {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    const h = new Headers(req.headers);
    h.set('x-webpos-bo', '1');
    return NextResponse.next({ request: { headers: h } });
  }

  // Route vitrine explicite
  if (pathname === '/site') return NextResponse.next();

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
