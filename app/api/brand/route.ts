import { NextResponse } from 'next/server';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import { getPlatformSettingsRaw } from '@/lib/settings/platform-server';

export const dynamic = 'force-dynamic';

/**
 * Branding public (aucun secret) : nom + logo + montants affichés des
 * offres. Consommé par les écrans de connexion et l'app pour afficher
 * le logo/nom personnalisés partout — appelé avec `cache: 'no-store'` côté
 * client (BrandMark), donc sur CHAQUE montage. La lecture Postgres elle-même
 * est mise en cache côté serveur (voir platform-server.ts) ; seule la
 * réponse HTTP reste non cachée, pour que l'affichage reflète un changement
 * de logo sans attendre.
 */
export async function GET() {
  let p: PlatformSettings;
  try {
    p = mergePlatformDefaults(await getPlatformSettingsRaw());
  } catch {
    p = mergePlatformDefaults(null);
  }
  return NextResponse.json({
    brand_name: p.brand_name,
    logo_url: p.logo_url,
    favicon_url: p.favicon_url,
    ca_logo_url: p.ca_logo_url,
    ca_favicon_url: p.ca_favicon_url,
    bo_logo_url: p.bo_logo_url,
    bo_favicon_url: p.bo_favicon_url,
    admin_logo_url: p.admin_logo_url,
    admin_favicon_url: p.admin_favicon_url,
    pda_logo_url: p.pda_logo_url,
    pda_favicon_url: p.pda_favicon_url,
    login_image_url: p.login_image_url,
    plan_essentiel_price: p.plan_essentiel_price,
    plan_croissance_price: p.plan_croissance_price,
    plan_reseau_price: p.plan_reseau_price,
  }, {
    // Jamais mis en cache : le logo/nom doit se refléter immédiatement.
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
