import { readSessionFromCookie } from '@/lib/auth/session';
import { headers } from 'next/headers';
import { query } from '@/lib/db/client';
import { userCan } from '@/lib/auth/permissions';
import { effectivePlan } from '@/lib/billing/plan-limits';
import SettingsMobileShell from './SettingsMobileShell';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = (await readSessionFromCookie())!;
  const h = headers();
  const backOffice = h.get('x-webpos-bo') === '1';

  // Adresse du back-office, pour y basculer depuis la caisse. Sur un vrai
  // domaine c'est le sous-domaine bo. ; en préversion (vercel.app, localhost)
  // il n'y a pas de sous-domaines, le chemin /bo joue ce rôle.
  const boUrl = backOffice ? null : backOfficeUrl(h.get('host'));

  // Plan effectif : certaines pages sont reservees a une offre superieure.
  let plan = 'trial';
  try {
    const p = await query<{ sub_plan: string | null; org_plan: string | null }>(
      `SELECT s.plan AS sub_plan, o.plan AS org_plan
         FROM organizations o LEFT JOIN subscriptions s ON s.organization_id = o.id
        WHERE o.id = $1`,
      [user.organizationId],
    );
    plan = effectivePlan(p.rows[0]?.sub_plan ?? null, p.rows[0]?.org_plan ?? null);
  } catch { /* defaut trial */ }
  // "Ecran & Livraison" (commande differee) reserve a Croissance+ :
  // masque pour l'offre Essentiel (starter).
  const proFeatures = plan !== 'starter';

  // Note :
  //   - /settings/access ("Masquer pages sidebar") : fonctionnalite
  //     retiree, on ne l'affiche plus dans la sidebar.
  //   - /settings/company ("Societe & boutiques") : reservee au
  //     back-office (sous-domaine bo.). Non visible sur le site principal.
  //   - /settings/screen-delivery : proOnly (offre Croissance+).
  const rawItems = [
    { href: '/settings/pos-settings',     label: 'Paramètres caisse',     icon: 'pos-settings' as const, perm: 'pos.use' as const,          boOnly: false, proOnly: false },
    { href: '/settings/opening-float',    label: 'Fond de caisse',        icon: 'closures' as const,     perm: 'pos.use' as const,          boOnly: false, proOnly: false },
    { href: '/settings/payment-methods',  label: 'Modes de règlement',    icon: 'invoices' as const,     perm: 'settings.write' as const,   boOnly: false, proOnly: false },
    { href: '/settings/tva',              label: 'TVA (par boutique)',    icon: 'invoices' as const,     perm: 'settings.read' as const,    boOnly: true,  proOnly: false },
    { href: '/settings/screen-delivery',  label: 'Écran & Livraison',     icon: 'truck' as const,        perm: 'settings.write' as const,   boOnly: false, proOnly: true },
    { href: '/settings/loyalty',          label: 'Fidélité',              icon: 'loyalty' as const,      perm: 'settings.write' as const,   boOnly: false, proOnly: false },
    { href: '/settings/cash',             label: 'Gestion argent',        icon: 'closures' as const,     perm: 'pos.use' as const,          boOnly: false, proOnly: false },
    { href: '/settings/invoicing',        label: 'Factures (RIB, règlement)', icon: 'invoices' as const,  perm: 'settings.read' as const,    boOnly: false, proOnly: false },
    { href: '/settings/e-invoicing',      label: 'Facturation électronique', icon: 'invoices' as const,  perm: 'settings.read' as const,    boOnly: false, proOnly: false },
    { href: '/settings/email',            label: 'Envoi d\'emails (Brevo)', icon: 'invoices' as const,     perm: 'settings.read' as const,    boOnly: true,  proOnly: false },
    // Ticket et Étiquettes : l'imprimante et son paramétrage vont de pair,
    // on les réunit dans un dossier plutôt que de les disperser dans la liste.
    { href: '/settings/receipt-printer',   label: 'Imprimante',            icon: 'print' as const,        perm: 'settings.read' as const,    boOnly: false, proOnly: false, group: 'ticket' as const },
    { href: '/settings/receipt',           label: 'Paramètres',            icon: 'print' as const,        perm: 'settings.write' as const,   boOnly: false, proOnly: false, group: 'ticket' as const },
    { href: '/settings/label-printer',     label: 'Imprimante',            icon: 'print' as const,        perm: 'settings.read' as const,    boOnly: false, proOnly: false, group: 'labels' as const },
    { href: '/settings/labels',            label: 'Paramètres',            icon: 'products' as const,     perm: 'settings.write' as const,   boOnly: false, proOnly: false, group: 'labels' as const },
    { href: '/settings/label-stations',    label: 'PDA',                   icon: 'products' as const,     perm: 'settings.read' as const,    boOnly: true,  proOnly: false },
    { href: '/settings/transport',        label: 'Coûts de transport',    icon: 'truck' as const,        perm: 'settings.write' as const,   boOnly: false, proOnly: false },
    { href: '/settings/permissions',      label: 'Permissions par rôle',  icon: 'users' as const,        perm: 'settings.write' as const,   boOnly: false, proOnly: false },
    { href: '/settings/users',            label: 'Gestion utilisateurs',  icon: 'users' as const,        perm: 'users.read' as const,       boOnly: false, proOnly: false },
    { href: '/settings/company',          label: 'Société & boutiques',   icon: 'settings' as const,     perm: 'settings.read' as const,    boOnly: true,  proOnly: false },
    { href: '/settings/subscription',     label: 'Abonnement',            icon: 'invoices' as const,     perm: 'settings.read' as const,    boOnly: false, proOnly: false },
    { href: '/settings/exports',          label: 'Exports comptables',    icon: 'exports' as const,      perm: 'fiscal.export' as const,    boOnly: false, proOnly: false },
    { href: '/settings/accounting-accounts', label: 'Comptes de ventes',  icon: 'exports' as const,      perm: 'accounting.read' as const,  boOnly: false, proOnly: false },
    { href: '/settings/fiscal',           label: 'Conformité fiscale',    icon: 'fiscal' as const,       perm: 'fiscal.audit' as const,     boOnly: false, proOnly: false },
  ];
  const allowed = await Promise.all(rawItems.map((i) => userCan(user, i.perm)));
  const items = rawItems
    .filter((_, idx) => allowed[idx])
    .filter((i) => backOffice || !i.boOnly)
    .filter((i) => !i.proOnly || proFeatures);

  return (
    <SettingsMobileShell items={items} boUrl={boUrl}>{children}</SettingsMobileShell>
  );
}

/** Mêmes règles de sous-domaine que le middleware. */
function backOfficeUrl(rawHost: string | null): string | null {
  const host = (rawHost ?? '').toLowerCase().split(':')[0] ?? '';
  if (!host) return null;
  if (host.endsWith('.vercel.app') || host === 'localhost') return '/bo';
  const base = ['app.', 'bo.', 'ca.', 'admin.', 'pda.', 'www.']
    .reduce((h, sub) => (h.startsWith(sub) ? h.slice(sub.length) : h), host);
  return `https://bo.${base}`;
}
