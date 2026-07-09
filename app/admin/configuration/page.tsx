import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import PlatformConfigForm from './PlatformConfigForm';

export const dynamic = 'force-dynamic';

export default async function AdminConfigurationPage() {
  let initial: PlatformSettings;
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    initial = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch {
    initial = mergePlatformDefaults(null);
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Configuration</h1>
      <p className="text-sm text-ink-soft mb-5">
        Branding du logiciel et identité de la société éditrice (affichée sur
        le site vitrine).
      </p>
      <PlatformConfigForm initial={initial} />
    </div>
  );
}
