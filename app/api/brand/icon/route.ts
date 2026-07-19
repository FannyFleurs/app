import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

export const dynamic = 'force-dynamic';

/**
 * Sert le favicon/icône en tant qu'image réelle (et non data: URL).
 * iOS Safari ignore les data: URLs pour le favicon et l'apple-touch-icon
 * (icône d'écran d'accueil) — il faut donc une vraie URL.
 *
 *   /api/brand/icon?scope=ca   -> favicon CA (fallback logo CA, puis app)
 *   /api/brand/icon?scope=app  -> favicon caisse (fallback logo principal)
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('scope');
  const scope = raw === 'ca' || raw === 'bo' || raw === 'admin' ? raw : 'app';

  let p: PlatformSettings;
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    p = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    p = mergePlatformDefaults(null);
  }

  // Chaque espace peut avoir son favicon dédié ; sinon repli sur le
  // favicon/logo principal.
  const src =
    scope === 'ca' ? (p.ca_favicon_url || p.ca_logo_url || p.favicon_url || p.logo_url)
    : scope === 'bo' ? (p.bo_favicon_url || p.favicon_url || p.logo_url)
    : scope === 'admin' ? (p.admin_favicon_url || p.favicon_url || p.logo_url)
    : (p.favicon_url || p.logo_url);

  // Aucun logo/favicon configuré : on renvoie un visuel NEUTRE (sac), jamais
  // l'ancien monogramme statique. Ainsi le favicon n'affiche plus « F ».
  if (!src) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">`
      + `<rect width="1024" height="1024" rx="220" fill="#556B3E"/>`
      + `<path d="M338 404 h348 l-42 306 a64 64 0 0 1 -63 55 H443 a64 64 0 0 1 -63 -55 Z" fill="none" stroke="#FFFFFF" stroke-width="46" stroke-linejoin="round"/>`
      + `<path d="M420 404 v-44 a92 92 0 0 1 184 0 v44" fill="none" stroke="#FFFFFF" stroke-width="46" stroke-linecap="round"/>`
      + `</svg>`;
    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store, max-age=0' },
    });
  }

  // URL externe : on redirige simplement.
  if (!src.startsWith('data:')) {
    return NextResponse.redirect(src);
  }

  // data: URL -> on décode et on renvoie les octets avec le bon type.
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src);
  if (!m) return new NextResponse(null, { status: 404 });
  const contentType = m[1] || 'image/png';
  const data = m[3] ?? '';
  const body = m[2]
    ? Buffer.from(data, 'base64')
    : Buffer.from(decodeURIComponent(data), 'utf-8');

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      // Pas de cache long : le favicon doit refléter un changement de logo.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
