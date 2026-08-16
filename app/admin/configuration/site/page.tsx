import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import { SITE_URL } from '@/lib/site/meta';
import SitePublicForm from './SitePublicForm';

export const dynamic = 'force-dynamic';

/** Configuration → Site public (publication du site vitrine). */
export default async function AdminSitePublicPage() {
  let merged: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    merged = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* table absente : on affiche l'état par défaut */ }

  const siteUrl = merged.website || SITE_URL;

  return <SitePublicForm initial={merged.site_public === true} siteUrl={siteUrl} />;
}
