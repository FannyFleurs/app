import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import SettingsSidebar from './SettingsSidebar';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = (await readSessionFromCookie())!;

  const items = [
    { href: '/settings/pos-settings', label: 'Paramètres caisse',     icon: 'pos-settings' as const, perm: 'pos.use' as const },
    { href: '/settings/cash',         label: 'Gestion argent',        icon: 'closures' as const,     perm: 'pos.use' as const },
    { href: '/settings/receipt',      label: 'Paramétrage ticket',    icon: 'print' as const,        perm: 'settings.write' as const },
    { href: '/settings/access',       label: 'Gestion d\'accès',      icon: 'users' as const,        perm: 'settings.write' as const },
    { href: '/settings/users',        label: 'Gestion utilisateurs',  icon: 'users' as const,        perm: 'users.read' as const },
    { href: '/settings/company',      label: 'Société & boutiques',   icon: 'settings' as const,     perm: 'settings.read' as const },
    { href: '/settings/exports',      label: 'Exports comptables',    icon: 'exports' as const,      perm: 'fiscal.export' as const },
    { href: '/settings/fiscal',       label: 'Conformité fiscale',    icon: 'fiscal' as const,       perm: 'fiscal.audit' as const },
  ].filter((i) => !i.perm || hasPermission(user.role, i.perm));

  return (
    <div className="grid grid-cols-[260px_1fr] h-[calc(100vh-56px)] overflow-hidden">
      <aside className="border-r border-border overflow-y-auto bg-white">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">Section</div>
          <div className="text-lg font-semibold tracking-tight">Paramètres</div>
        </div>
        <SettingsSidebar items={items} />
      </aside>
      <main className="overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
