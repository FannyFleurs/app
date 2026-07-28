import { NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import * as PImage from 'pureimage';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

export const dynamic = 'force-dynamic';

/**
 * Sert le favicon/icône PAR ESPACE (configuré dans l'admin → Configuration),
 * en tant qu'image réelle. iOS/Android ignorent les data: URLs pour l'icône
 * d'écran d'accueil — il faut une vraie URL.
 *
 *   /api/brand/icon?scope=pda            -> favicon PDA (repli logo/app)
 *   /api/brand/icon?scope=app&size=512   -> favicon caisse en PNG 512×512
 *
 * Paramètre `size` : renvoie un PNG carré N×N (utilisé par les manifestes PWA,
 * Android exigeant du PNG raster). Fonctionne quand le favicon configuré est
 * une image matricielle (PNG/JPEG) : on la redimensionne « contain » sur fond
 * transparent, sans déformation. Sinon (SVG, URL externe injoignable), on
 * retombe sur le comportement normal (image d'origine).
 */

async function rasterBytes(src: string): Promise<{ buf: Buffer; format: 'png' | 'jpeg' } | null> {
  let buf: Buffer;
  let ct = '';
  if (src.startsWith('data:')) {
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src);
    if (!m) return null;
    ct = m[1] || '';
    buf = m[2] ? Buffer.from(m[3] ?? '', 'base64') : Buffer.from(decodeURIComponent(m[3] ?? ''), 'utf-8');
  } else {
    try {
      const r = await fetch(src);
      if (!r.ok) return null;
      ct = r.headers.get('content-type') ?? '';
      buf = Buffer.from(await r.arrayBuffer());
    } catch { return null; }
  }
  // Détection du format (content-type, sinon octets magiques).
  const isPng = ct.includes('png') || (buf[0] === 0x89 && buf[1] === 0x50);
  const isJpeg = ct.includes('jpeg') || ct.includes('jpg') || (buf[0] === 0xff && buf[1] === 0xd8);
  if (isPng) return { buf, format: 'png' };
  if (isJpeg) return { buf, format: 'jpeg' };
  return null; // SVG ou autre : non redimensionnable ici
}

async function toSquarePng(src: string, size: number): Promise<Buffer | null> {
  const raster = await rasterBytes(src);
  if (!raster) return null;
  try {
    const decoded = raster.format === 'png'
      ? await PImage.decodePNGFromStream(Readable.from(raster.buf))
      : await PImage.decodeJPEGFromStream(Readable.from(raster.buf));
    const out = PImage.make(size, size);
    const ctx = out.getContext('2d');
    // « contain » centré (sans déformation), fond transparent conservé.
    const scale = Math.min(size / decoded.width, size / decoded.height);
    const dw = Math.round(decoded.width * scale);
    const dh = Math.round(decoded.height * scale);
    const dx = Math.round((size - dw) / 2);
    const dy = Math.round((size - dh) / 2);
    ctx.drawImage(decoded, 0, 0, decoded.width, decoded.height, dx, dy, dw, dh);
    const PassThrough = (await import('node:stream')).PassThrough;
    const pass = new PassThrough();
    const chunks: Buffer[] = [];
    pass.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((res, rej) => { pass.on('end', res); pass.on('error', rej); });
    await PImage.encodePNGToStream(out, pass);
    await done;
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('scope');
  const scope = raw === 'ca' || raw === 'bo' || raw === 'admin' || raw === 'pda' ? raw : 'app';
  const sizeRaw = Number(url.searchParams.get('size'));
  const size = Number.isFinite(sizeRaw) ? Math.max(48, Math.min(1024, Math.round(sizeRaw))) : 0;

  let p: PlatformSettings;
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    p = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    p = mergePlatformDefaults(null);
  }

  // Favicon dédié à l'espace ; sinon repli sur le favicon/logo principal.
  const src =
    scope === 'ca' ? (p.ca_favicon_url || p.ca_logo_url || p.favicon_url || p.logo_url)
    : scope === 'bo' ? (p.bo_favicon_url || p.bo_logo_url || p.favicon_url || p.logo_url)
    : scope === 'admin' ? (p.admin_favicon_url || p.admin_logo_url || p.favicon_url || p.logo_url)
    : scope === 'pda' ? (p.pda_favicon_url || p.pda_logo_url || p.favicon_url || p.logo_url)
    : (p.favicon_url || p.logo_url);

  // Aucun favicon configuré : visuel neutre (jamais l'ancien monogramme).
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

  // Taille demandée (manifeste PWA / Android) : on renvoie un PNG carré du
  // favicon CONFIGURÉ. Si le favicon n'est pas matriciel, on retombe plus bas.
  if (size > 0) {
    const png = await toSquarePng(src, size);
    if (png) {
      return new NextResponse(png, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store, max-age=0' },
      });
    }
  }

  // URL externe : redirection simple.
  if (!src.startsWith('data:')) {
    return NextResponse.redirect(src);
  }

  // data: URL -> octets décodés avec le bon type.
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src);
  if (!m) return new NextResponse(null, { status: 404 });
  const contentType = m[1] || 'image/png';
  const data = m[3] ?? '';
  const body = m[2]
    ? Buffer.from(data, 'base64')
    : Buffer.from(decodeURIComponent(data), 'utf-8');

  return new NextResponse(body, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store, max-age=0' },
  });
}
