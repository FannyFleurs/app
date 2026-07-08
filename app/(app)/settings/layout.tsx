import { readSessionFromCookie } from '@/lib/auth/session';
import { headers } from 'next/headers';
import { userCan } from '@/lib/auth/permissions';
import SettingsMobileShell from './SettingsMobileShell';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';

  // Note :
  //   - /settings/access ("Masquer pages sidebar") : fonctionnalite
  //     retiree, on ne l'affiche plus dans la sidebar.
  //   - /settings/company ("Societe & boutiques") : reservee au
  //     back-office (sous-domaine bo.). Non visible sur le site principal.
  const rawItems = [
    { href: '/settings/pos-settings',     label: 'Paramètres caisse',     icon: 'pos-settings' as const, perm: 'pos.use' as const,          boOnly: false },
    { href: '/settings/opening-float',    label: 'Fond de caisse',        icon: 'closures' as const,     perm: 'pos.use' as const,          boOnly: false },
    { href: '/settings/payment-methods',  label: 'Modes de règlement',    icon: 'invoices' as const,     perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/screen-delivery',  label: 'Écran & Livraison',     icon: 'truck' as const,        perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/loyalty',          label: 'Fidélité',              icon: 'loyalty' as const,      perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/cash',             label: 'Gestion argent',        icon: 'closures' as const,     perm: 'pos.use' as const,          boOnly: false },
    { href: '/settings/receipt',          label: 'Paramétrage ticket',    icon: 'print' as const,        perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/printer',          label: 'Imprimante ticket (IP)', icon: 'print' as const,       perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/permissions',      label: 'Permissions par rôle',  icon: 'users' as const,        perm: 'settings.write' as const,   boOnly: false },
    { href: '/settings/users',            label: 'Gestion utilisateurs',  icon: 'users' as const,        perm: 'users.read' as const,       boOnly: false },
    { href: '/settings/company',          label: 'Société & boutiques',   icon: 'settings' as const,     perm: 'settings.read' as const,    boOnly: true },
    { href: '/settings/subscription',     label: 'Abonnement',            icon: 'invoices' as const,     perm: 'settings.read' as const,    boOnly: false },
    { href: '/settings/exports',          label: 'Exports comptables',    icon: 'exports' as const,      perm: 'fiscal.export' as const,    boOnly: false },
    { href: '/settings/fiscal',           label: 'Conformité fiscale',    icon: 'fiscal' as const,       perm: 'fiscal.audit' as const,     boOnly: false },
  ];
  const allowed = await Promise.all(rawItems.map((i) => userCan(user, i.perm)));
  const items = rawItems
    .filter((_, idx) => allowed[idx])
    .filter((i) => backOffice || !i.boOnly);

  return (
    <SettingsMobileShell items={items}>{children}</SettingsMobileShell>
  );
}
