'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth/rbac';
import { hasPermission, type Permission } from '@/lib/auth/rbac';

interface Item {
  href: string;
  label: string;
  perm?: Permission;
  icon: string;
  group: string;
}

const ITEMS: Item[] = [
  { href: '/dashboard',  label: 'Tableau de bord',      icon: '◐', group: 'Pilotage' },
  { href: '/caisse',     label: 'Caisse',               icon: '◆', group: 'Vente',    perm: 'pos.use' },
  { href: '/orders',     label: 'Commandes',            icon: '✿', group: 'Vente' },
  { href: '/invoices',   label: 'Factures',             icon: '◼', group: 'Vente' },
  { href: '/customers',  label: 'Clients',              icon: '◉', group: 'Relation', perm: 'customers.read' },
  { href: '/loyalty',    label: 'Fidélité',             icon: '✦', group: 'Relation' },
  { href: '/products',   label: 'Produits',             icon: '◈', group: 'Catalogue',perm: 'products.read' },
  { href: '/categories', label: 'Catégories',           icon: '◊', group: 'Catalogue',perm: 'products.read' },
  { href: '/stock',      label: 'Stock',                icon: '▣', group: 'Catalogue' },
  { href: '/closures',   label: 'Clôtures de caisse',   icon: '◐', group: 'Compta',   perm: 'closures.daily' },
  { href: '/exports',    label: 'Exports comptables',   icon: '◇', group: 'Compta',   perm: 'fiscal.export' },
  { href: '/fiscal',     label: 'Conformité fiscale',   icon: '◉', group: 'Compta',   perm: 'fiscal.audit' },
  { href: '/users',      label: 'Utilisateurs',         icon: '◎', group: 'Système',  perm: 'users.read' },
  { href: '/settings',   label: 'Paramètres',           icon: '○', group: 'Système',  perm: 'settings.read' },
];

const GROUP_ORDER = ['Pilotage', 'Vente', 'Relation', 'Catalogue', 'Compta', 'Système'];

export default function Sidebar({ role }: { role: Role }) {
  const path = usePathname();
  const visible = ITEMS.filter((i) => !i.perm || hasPermission(role, i.perm));
  return (
    <nav className="px-2 pt-2 pb-40 space-y-4">
      {GROUP_ORDER.map((g) => {
        const items = visible.filter((i) => i.group === g);
        if (items.length === 0) return null;
        return (
          <div key={g}>
            <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-ink-soft/60 font-semibold">
              {g}
            </div>
            <div className="space-y-0.5">
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + '/');
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={`nav-link ${active ? 'nav-link-active' : ''}`}
                  >
                    <span className="w-5 text-center text-sage-deep">{i.icon}</span>
                    {i.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
