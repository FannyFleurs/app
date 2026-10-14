import 'server-only';
import { query } from '@/lib/db/client';
import type { PlatformSettings } from './platform';

/**
 * Configuration plateforme (platform_settings, ligne unique) : lue sur
 * CHAQUE vue du site vitrine public (pages marketing, mentions légales…,
 * toutes `force-dynamic`, donc jamais mises en cache par Next) et sur
 * chaque écran de connexion/chargement de l'app (BrandMark → /api/brand,
 * appelé avec `cache: 'no-store'`). Sans cache serveur, c'est une requête
 * Postgres par visite — et la ligne peut contenir plusieurs logos/favicons/
 * visuel de connexion collés en data URL (jusqu'à ~1,5 à 5 Mo chacun,
 * voir /api/admin/platform-config) : exactement le genre de lecture
 * répétée et volumineuse qui gonfle le transfert réseau.
 *
 * Cache en mémoire, courte durée (1 min) : un changement de branding par le
 * super-admin met jusqu'à 1 min à apparaître partout, acceptable pour un
 * réglage qui change rarement — largement compensé par l'essentiel du
 * trafic qui n'a plus jamais à retoucher la base. `invalidate()` permet
 * aussi de le refléter immédiatement après une sauvegarde.
 */
const TTL_MS = 60_000;
let cached: { value: Partial<PlatformSettings> | null; at: number } | null = null;
let inFlight: Promise<Partial<PlatformSettings> | null> | null = null;

async function fetchRaw(): Promise<Partial<PlatformSettings> | null> {
  const { rows } = await query<{ value: Partial<PlatformSettings> }>(
    `SELECT value FROM platform_settings WHERE id = 1`,
  );
  return rows[0]?.value ?? null;
}

/** Valeur brute (avant mergePlatformDefaults), mise en cache. */
export async function getPlatformSettingsRaw(): Promise<Partial<PlatformSettings> | null> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.value;
  // Plusieurs requêtes concurrentes pendant un cache froid ne déclenchent
  // qu'UNE lecture Postgres, pas une par requête HTTP en vol.
  if (!inFlight) {
    inFlight = fetchRaw()
      .then((v) => { cached = { value: v, at: Date.now() }; return v; })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** À appeler après toute sauvegarde de platform_settings. */
export function invalidatePlatformSettingsCache(): void {
  cached = null;
}
