import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import BrandingForm from './BrandingForm';

export const dynamic = 'force-dynamic';

/** Configuration → Marque & logos (branding + favicons par espace). */
export default async function AdminConfigurationBrandingPage() {
  let merged: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    merged = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* migration 0029 absente */ }

  return (
    <BrandingForm
      initial={{
        brand_name: merged.brand_name,
        logo_url: merged.logo_url,
        favicon_url: merged.favicon_url,
        login_image_url: merged.login_image_url,
        bo_logo_url: merged.bo_logo_url,
        bo_favicon_url: merged.bo_favicon_url,
        admin_logo_url: merged.admin_logo_url,
        admin_favicon_url: merged.admin_favicon_url,
        pda_logo_url: merged.pda_logo_url,
        pda_favicon_url: merged.pda_favicon_url,
        ca_logo_url: merged.ca_logo_url,
        ca_favicon_url: merged.ca_favicon_url,
      }}
    />
  );
}
