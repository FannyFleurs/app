import 'server-only';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from './platform';

/**
 * Branding résolu côté serveur, pour les pages de connexion (rendu SSR du
 * logo → aucun flash de monogramme). `caLogoUrl` retombe sur le logo
 * principal si aucun logo CA dédié n'est défini.
 */
export async function getServerBrand(): Promise<{
  brandName: string; logoUrl: string; caLogoUrl: string;
  boLogoUrl: string; adminLogoUrl: string; pdaLogoUrl: string;
}> {
  let cfg: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    cfg = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* défauts */ }
  const main = cfg.logo_url || '';
  return {
    brandName: cfg.brand_name || 'HelloPos',
    logoUrl: main,
    caLogoUrl: cfg.ca_logo_url || main,
    boLogoUrl: cfg.bo_logo_url || main,
    adminLogoUrl: cfg.admin_logo_url || main,
    pdaLogoUrl: cfg.pda_logo_url || main,
  };
}
