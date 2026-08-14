import 'server-only';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';

/**
 * Réglages de la plateforme (nom, logo, tarifs, coordonnées) pour le site
 * vitrine. Partagé par le layout et toutes les pages marketing pour que
 * l'en-tête, le pied et les tarifs restent d'accord.
 */
export async function loadPlatform(): Promise<PlatformSettings> {
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    return mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    return mergePlatformDefaults(null);
  }
}
