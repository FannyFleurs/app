import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import PlatformConfigForm, { type FormData } from './PlatformConfigForm';

export const dynamic = 'force-dynamic';

export default async function AdminConfigurationPage() {
  let merged: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    merged = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* migration 0029 absente */ }

  // On ne transmet JAMAIS les secrets au client : masqués + flag "défini".
  const initial: FormData = {
    ...merged,
    stripe_secret_key: '',
    stripe_secret_key_set: !!merged.stripe_secret_key,
    stripe_webhook_secret: '',
    stripe_webhook_secret_set: !!merged.stripe_webhook_secret,
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Configuration</h1>
      <p className="text-sm text-ink-soft mb-5">
        Branding du logiciel et identité de la société éditrice (affichée sur
        le site vitrine).
      </p>
      <PlatformConfigForm initial={initial} />
    </div>
  );
}
