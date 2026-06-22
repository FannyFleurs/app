'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth/rbac';
import { hasPermission, type Permission } from '@/lib/auth/rbac';
import Icon, { type IconName } from './Icon';

interface Item {
  href: string;
  label: string;
  perm?: Permission;
  icon: IconName;
  group: string;
}

const ITEMS: Item[] = [
  { href: '/dashboard',    label: 'Tableau de bord',      icon: 'dashboard',    group: 'Pilotage' },
  { href: '/caisse',       label: 'Caisse',               icon: 'pos',          group: 'Vente',    perm: 'pos.use' },
  { href: '/ma-journee',   label: 'Ma journée',           icon: 'my-day',       group: 'Vente',    perm: 'pos.use' },
  { href: '/pos-settings', label: 'Paramètres caisse',    icon: 'pos-settings', group: 'Vente',    perm: 'pos.use' },
  { href: '/orders',       label: 'Commandes',            icon: 'orders',       group: 'Vente' },
  { href: '/invoices',     label: 'Factures',             icon: 'invoices',     group: 'Vente' },
  { href: '/gift-cards',   label: 'Cartes cadeaux',       icon: 'loyalty',      group: 'Vente',    perm: 'pos.use' },
  { href: '/customers',    label: 'Clients',              icon: 'customers',    group: 'Relation', perm: 'customers.read' },
  { href: '/products',     label: 'Produits',             icon: 'products',     group: 'Catalogue',perm: 'products.read' },
  { href: '/categories',   label: 'Catégories',           icon: 'categories',   group: 'Catalogue',perm: 'products.read' },
  { href: '/stock',        label: 'Stock',                icon: 'stock',        group: 'Catalogue' },
  { href: '/closures',     label: 'Clôtures',             icon: 'closures',     group: 'Compta',   perm: 'closures.daily' },
  { href: '/exports',      label: 'Exports comptables',   icon: 'exports',      group: 'Compta',   perm: 'fiscal.export' },
  { href: '/fiscal',       label: 'Conformité fiscale',   icon: 'fiscal',       group: 'Compta',   perm: 'fiscal.audit' },
  { href: '/users',        label: 'Utilisateurs',         icon: 'users',        group: 'Système',  perm: 'users.read' },
  { href: '/settings',     label: 'Paramètres',           icon: 'settings',     group: 'Système',  perm: 'settings.read' },
];

const GROUP_ORDER = ['Pilotage', 'Vente', 'Relation', 'Catalogue', 'Compta', 'Système'];

export default function Sidebar({ role, collapsed }: { role: Role; collapsed?: boolean }) {
  const path = usePathname();
  const visible = ITEMS.filter((i) => !i.perm || hasPermission(role, i.perm));

  return (
    <nav className="px-2 pt-2 pb-6 space-y-3">
      {GROUP_ORDER.map((g) => {
        const items = visible.filter((i) => i.group === g);
        if (items.length === 0) return null;
        return (
          <div key={g}>
            {!collapsed && (
              <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-ink-soft/60 font-semibold">
                {g}
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + '/');
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    title={collapsed ? i.label : undefined}
                    className={`nav-link ${active ? 'nav-link-active' : ''} ${collapsed ? 'justify-center px-2 py-2.5' : 'py-2'}`}
                  >
                    <span className="shrink-0 text-accent-deep">
                      <Icon name={i.icon} size={collapsed ? 24 : 22} />
                    </span>
                    {!collapsed && <span className="truncate">{i.label}</span>}
                  </Link>
                );
              })}
            </div>
            {!collapsed && <div className="h-px bg-border/60 mx-3 mt-2" />}
          </div>
        );
      })}
    </nav>
  );
}
