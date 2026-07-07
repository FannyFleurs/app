'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth/rbac';
import { hasPermission, type Permission } from '@/lib/auth/rbac';
import Icon, { type IconName } from './Icon';

export interface SidebarItem {
  href: string;
  label: string;
  perm?: Permission;
  icon: IconName;
  group: string;
  /** Si true, l'utilisateur ne peut pas désactiver l'item via gestion d'accès. */
  required?: boolean;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  // Vente — Caisse en premier
  { href: '/caisse',       label: 'Caisse',               icon: 'pos',          group: 'Vente',    perm: 'pos.use', required: true },
  { href: '/ma-journee',   label: 'Ma journée',           icon: 'my-day',       group: 'Vente',    perm: 'pos.use' },
  { href: '/orders',       label: 'Commandes',            icon: 'orders',       group: 'Vente' },
  { href: '/invoices',     label: 'Factures',             icon: 'invoices',     group: 'Vente' },
  { href: '/vouchers',     label: 'Avoirs & cartes cadeaux', icon: 'loyalty',    group: 'Vente',    perm: 'pos.use' },
  // Relation
  { href: '/customers',    label: 'Clients',              icon: 'customers',    group: 'Relation', perm: 'customers.read' },
  // Catalogue
  { href: '/products',     label: 'Produits',             icon: 'products',     group: 'Catalogue',perm: 'products.read' },
  { href: '/categories',   label: 'Catégories',           icon: 'categories',   group: 'Catalogue',perm: 'products.read' },
  { href: '/stock',        label: 'Stock',                icon: 'stock',        group: 'Catalogue' },
  { href: '/inventory',    label: 'Inventaire',           icon: 'closures',     group: 'Catalogue' },
  // Pilotage (en bas — pas en haut)
  { href: '/dashboard',    label: 'Tableau de bord',      icon: 'dashboard',    group: 'Pilotage' },
  // Système
  { href: '/settings/users', label: 'Utilisateurs',       icon: 'users',        group: 'Système',  perm: 'users.read' },
  { href: '/settings',     label: 'Paramètres',           icon: 'settings',     group: 'Système',  perm: 'settings.read', required: true },
];

const GROUP_ORDER = ['Vente', 'Relation', 'Catalogue', 'Pilotage', 'Système'];

export default function Sidebar({
  role, hiddenPaths = [], onItemClick,
}: { role: Role; hiddenPaths?: string[]; onItemClick?: () => void }) {
  const path = usePathname();
  const visible = SIDEBAR_ITEMS.filter((i) => !i.perm || hasPermission(role, i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  return (
    <nav className="px-2 pt-2 pb-6 space-y-3">
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
                    onClick={onItemClick}
                    className={`nav-link py-2 ${active ? 'nav-link-active' : ''}`}
                  >
                    <span className="shrink-0 text-accent-deep">
                      <Icon name={i.icon} size={22} />
                    </span>
                    <span className="truncate">{i.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="h-px bg-border/60 mx-3 mt-2" />
          </div>
        );
      })}
    </nav>
  );
}
