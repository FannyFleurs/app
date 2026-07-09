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
    plan_essentiel_price: p.plan_essentiel_price,
    plan_croissance_price: p.plan_croissance_price,
  });
}
