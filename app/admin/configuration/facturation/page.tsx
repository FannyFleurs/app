import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import FacturationForm from '../FacturationForm';

export const dynamic = 'force-dynamic';

/** Configuration → Facturation Stripe (abonnements SaaS). */
export default async function AdminConfigurationFacturationPage() {
  let m: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    m = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* migration 0029 absente */ }

  // On ne transmet JAMAIS les secrets au client : masqués + flag "défini".
  return (
    <FacturationForm
      initial={{
        stripe_publishable_key: m.stripe_publishable_key,
        stripe_secret_key: '',
        stripe_secret_key_set: !!m.stripe_secret_key,
        stripe_webhook_secret: '',
        stripe_webhook_secret_set: !!m.stripe_webhook_secret,
        stripe_price_essentiel: m.stripe_price_essentiel,
        stripe_price_croissance: m.stripe_price_croissance,
        stripe_price_reseau: m.stripe_price_reseau,
        trial_days: m.trial_days,
        plan_essentiel_price: m.plan_essentiel_price,
        plan_croissance_price: m.plan_croissance_price,
        plan_reseau_price: m.plan_reseau_price,
        plan_essentiel_name: m.plan_essentiel_name,
        plan_croissance_name: m.plan_croissance_name,
        plan_reseau_name: m.plan_reseau_name,
        stripe_price_extra_register: m.stripe_price_extra_register,
        addon_register_price: m.addon_register_price,
      }}
    />
  );
}
