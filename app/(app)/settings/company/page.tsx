import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { planLimits, effectivePlan } from '@/lib/billing/plan-limits';
import { mergePlatformDefaults, planDisplayName, type PlatformSettings } from '@/lib/settings/platform';
import CompanyAdmin from './CompanyAdmin';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const org = await query<{
    name: string; legal_name: string; siret: string | null; siren: string | null; vat_number: string | null;
    address: { line1?: string; line2?: string; zip?: string; city?: string; country?: string } | null;
    contact: { phone?: string; email?: string; website?: string } | null;
  }>(
    `SELECT name, legal_name, siret, siren, vat_number, address, contact
       FROM organizations WHERE id = $1`,
    [user.organizationId],
  );

  // Limites de l'offre (pour désactiver les boutons d'ajout côté UI).
  let plan = 'trial';
  let extra = 0;
  try {
    const p = await query<{ sub_plan: string | null; org_plan: string | null; extra: number | null }>(
      `SELECT s.plan AS sub_plan, o.plan AS org_plan, s.extra_registers AS extra
         FROM organizations o LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [user.organizationId],
    );
    plan = effectivePlan(p.rows[0]?.sub_plan ?? null, p.rows[0]?.org_plan ?? null);
    extra = Number(p.rows[0]?.extra ?? 0) || 0;
  } catch { /* défaut trial */ }
  const limits = planLimits(plan, extra);

  // Option caisse supplémentaire (disponible sur Essentiel si configurée).
  let addon: PlatformSettings = mergePlatformDefaults(null);
  try {
    const pr = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    addon = mergePlatformDefaults(pr.rows[0]?.value ?? null);
  } catch { /* défauts */ }
  const canBuyExtraRegister =
    plan === 'starter' && !!addon.stripe_secret_key && !!addon.stripe_price_extra_register;

  return (
    <CompanyAdmin
      org={org.rows[0]!}
      canWrite={(await userCan(user, 'settings.write'))}
      planLabel={planDisplayName(plan, addon)}
      maxStores={Number.isFinite(limits.maxStores) ? limits.maxStores : null}
      maxRegistersPerStore={Number.isFinite(limits.maxRegistersPerStore) ? limits.maxRegistersPerStore : null}
      canBuyExtraRegister={canBuyExtraRegister}
      extraRegisterPrice={addon.addon_register_price}
    />
  );
}
