import 'server-only';
import { mergePlatformDefaults, type PlatformSettings } from './platform';
import { getPlatformSettingsRaw } from './platform-server';

/**
 * Branding résolu côté serveur, pour les pages de connexion (rendu SSR du
 * logo → aucun flash de monogramme). `caLogoUrl` retombe sur le logo
 * principal si aucun logo CA dédié n'est défini. Lecture mise en cache
 * (voir platform-server.ts) : un écran de connexion rendu à chaque
 * déconnexion/verrouillage caisse ne doit pas repayer une requête Postgres
 * à chaque fois.
 */
export async function getServerBrand(): Promise<{
  brandName: string; logoUrl: string; caLogoUrl: string;
  boLogoUrl: string; adminLogoUrl: string; pdaLogoUrl: string;
}> {
  let cfg: PlatformSettings = mergePlatformDefaults(null);
  try {
    cfg = mergePlatformDefaults(await getPlatformSettingsRaw());
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
