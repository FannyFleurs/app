import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

export const dynamic = 'force-dynamic';

/**
 * Branding public (aucun secret) : nom + logo + montants affichés des
 * offres. Consommé par les écrans de connexion et l'app pour afficher
 * le logo/nom personnalisés partout.
 */
export async function GET() {
  let p: PlatformSettings;
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    p = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    p = mergePlatformDefaults(null);
  }
  return NextResponse.json({
    brand_name: p.brand_name,
    logo_url: p.logo_url,
    favicon_url: p.favicon_url,
    ca_logo_url: p.ca_logo_url,
    ca_favicon_url: p.ca_favicon_url,
    plan_essentiel_price: p.plan_essentiel_price,
    plan_croissance_price: p.plan_croissance_price,
  }, {
    // Jamais mis en cache : le logo/nom doit se refléter immédiatement.
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
