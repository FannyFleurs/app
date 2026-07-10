import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import OrganizationDetail from './OrganizationDetail';

export const dynamic = 'force-dynamic';

export default async function AdminOrgDetailPage({ params }: { params: { id: string } }) {
  // Noms d'offres configurés (affichage cohérent dans l'admin).
  let cfg: PlatformSettings = mergePlatformDefaults(null);
  try {
    const pr = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    cfg = mergePlatformDefaults(pr.rows[0]?.value ?? null);
  } catch { /* défauts */ }

  const planNames = {
    starter: cfg.plan_essentiel_name,
    pro: cfg.plan_croissance_name,
    enterprise: cfg.plan_reseau_name,
  };

  return <OrganizationDetail id={params.id} planNames={planNames} />;
}
