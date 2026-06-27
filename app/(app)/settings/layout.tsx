import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import SettingsSidebar from './SettingsSidebar';
import SettingsMobileShell from './SettingsMobileShell';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = (await readSessionFromCookie())!;

  const items = [
    { href: '/settings/pos-settings',     label: 'Paramètres caisse',     icon: 'pos-settings' as const, perm: 'pos.use' as const },
    { href: '/settings/opening-float',    label: 'Fond de caisse',        icon: 'closures' as const,     perm: 'pos.use' as const },
    { href: '/settings/payment-methods',  label: 'Modes de règlement',    icon: 'invoices' as const,     perm: 'settings.write' as const },
    { href: '/settings/stripe',           label: 'Stripe (lien paiement)',icon: 'invoices' as const,     perm: 'settings.write' as const },
    { href: '/settings/loyalty',          label: 'Fidélité',              icon: 'loyalty' as const,      perm: 'settings.write' as const },
    { href: '/settings/cash',             label: 'Gestion argent',        icon: 'closures' as const,     perm: 'pos.use' as const },
    { href: '/settings/receipt',          label: 'Paramétrage ticket',    icon: 'print' as const,        perm: 'settings.write' as const },
    { href: '/settings/printer',          label: 'Imprimante ticket (IP)', icon: 'print' as const,       perm: 'settings.write' as const },
    { href: '/settings/access',           label: 'Masquer pages sidebar', icon: 'users' as const,        perm: 'settings.write' as const },
    { href: '/settings/permissions',      label: 'Permissions par rôle',  icon: 'users' as const,        perm: 'settings.write' as const },
    { href: '/settings/users',            label: 'Gestion utilisateurs',  icon: 'users' as const,        perm: 'users.read' as const },
    { href: '/settings/company',          label: 'Société & boutiques',   icon: 'settings' as const,     perm: 'settings.read' as const },
    { href: '/settings/subscription',     label: 'Abonnement',            icon: 'invoices' as const,     perm: 'settings.read' as const },
    { href: '/settings/exports',          label: 'Exports comptables',    icon: 'exports' as const,      perm: 'fiscal.export' as const },
    { href: '/settings/fiscal',           label: 'Conformité fiscale',    icon: 'fiscal' as const,       perm: 'fiscal.audit' as const },
  ].filter((i) => !i.perm || hasPermission(user.role, i.perm));

  return (
    <SettingsMobileShell items={items}>{children}</SettingsMobileShell>
  );
}
