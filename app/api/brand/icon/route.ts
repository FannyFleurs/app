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
  const scope = new URL(req.url).searchParams.get('scope') === 'ca' ? 'ca' : 'app';

  let p: PlatformSettings;
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    p = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    p = mergePlatformDefaults(null);
  }

  const src = scope === 'ca'
    ? (p.ca_favicon_url || p.ca_logo_url || p.favicon_url || p.logo_url)
    : (p.favicon_url || p.logo_url);

  if (!src) return new NextResponse(null, { status: 404 });

  // URL externe : on redirige simplement.
  if (!src.startsWith('data:')) {
    return NextResponse.redirect(src);
  }

  // data: URL -> on décode et on renvoie les octets avec le bon type.
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src);
  if (!m) return new NextResponse(null, { status: 404 });
  const contentType = m[1] || 'image/png';
  const body = m[2]
    ? Buffer.from(m[3], 'base64')
    : Buffer.from(decodeURIComponent(m[3]), 'utf-8');

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      // Pas de cache long : le favicon doit refléter un changement de logo.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
