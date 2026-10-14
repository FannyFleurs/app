import 'server-only';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import { getPlatformSettingsRaw } from '@/lib/settings/platform-server';

/**
 * Réglages de la plateforme (nom, logo, tarifs, coordonnées) pour le site
 * vitrine. Partagé par le layout et toutes les pages marketing pour que
 * l'en-tête, le pied et les tarifs restent d'accord. Le site est entièrement
 * `force-dynamic` (jamais de cache Next) : la lecture est mise en cache
 * côté serveur (voir platform-server.ts) pour ne pas payer une requête
 * Postgres à chaque visite publique.
 */
export async function loadPlatform(): Promise<PlatformSettings> {
  try {
    return mergePlatformDefaults(await getPlatformSettingsRaw());
  } catch {
    return mergePlatformDefaults(null);
  }
}
