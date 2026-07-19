import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import SocieteForm from '../SocieteForm';

export const dynamic = 'force-dynamic';

/** Configuration → Société & contact. */
export default async function AdminConfigurationSocietePage() {
  let m: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    m = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* migration 0029 absente */ }

  return (
    <SocieteForm
      initial={{
        company_legal_name: m.company_legal_name,
        company_siren: m.company_siren,
        company_siret: m.company_siret,
        company_vat: m.company_vat,
        address_line1: m.address_line1,
        address_zip: m.address_zip,
        address_city: m.address_city,
        address_country: m.address_country,
        contact_email: m.contact_email,
        contact_phone: m.contact_phone,
        website: m.website,
      }}
    />
  );
}
