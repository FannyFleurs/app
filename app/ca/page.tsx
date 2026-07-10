import { readSessionFromCookie } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import CADashboard from './CADashboard';

export const dynamic = 'force-dynamic';

export default async function CAPage() {
  const user = await readSessionFromCookie();
  if (!user) redirect('/ca/login');

  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores
      WHERE organization_id = $1 AND is_active = TRUE
      ORDER BY name`,
    [user.organizationId],
  );

  const org = await query<{ name: string }>(
    `SELECT name FROM organizations WHERE id = $1`,
    [user.organizationId],
  );

  // Logo de l'espace CA : logo CA dédié si défini, sinon logo principal.
  let cfg: PlatformSettings = mergePlatformDefaults(null);
  try {
    const pr = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    cfg = mergePlatformDefaults(pr.rows[0]?.value ?? null);
  } catch { /* défauts */ }
  const logoUrl = cfg.ca_logo_url || cfg.logo_url || '';

  return (
    <CADashboard
      stores={stores.rows}
      orgName={org.rows[0]?.name ?? 'Boutique'}
      logoUrl={logoUrl}
      user={{ fullName: user.fullName, email: user.email }}
    />
  );
}
