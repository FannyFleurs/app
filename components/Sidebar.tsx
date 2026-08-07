'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/auth/rbac';
import { hasPermission, type Permission } from '@/lib/auth/rbac';
import Icon, { type IconName } from './Icon';
import { activeNavHref } from '@/lib/nav/active';

export interface SidebarItem {
  href: string;
  label: string;
  perm?: Permission;
  icon: IconName;
  group: string;
  /** Si true, l'utilisateur ne peut pas désactiver l'item via gestion d'accès. */
  required?: boolean;
  /** Si true, l'item n'apparaît que dans le back-office (sous-domaine bo.). */
  boOnly?: boolean;
}

/**
 * Toute entrée porte une permission. Une entrée sans permission est visible de
 * TOUS les rôles — ce qui passait inaperçu tant qu'aucun rôle n'était vraiment
 * restreint, et faisait apparaître Stock ou Factures au comptable externe.
 */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  // Vente — Caisse en premier
  { href: '/caisse',       label: 'Caisse',               icon: 'pos',          group: 'Vente',    perm: 'pos.use', required: true },
  { href: '/ma-journee',   label: 'Ma journée',           icon: 'my-day',       group: 'Vente',    perm: 'pos.use' },
  { href: '/orders',       label: 'Commandes',            icon: 'orders',       group: 'Vente',    perm: 'pos.use' },
  { href: '/atelier',      label: 'Écran atelier',        icon: 'sparkle',      group: 'Vente',    perm: 'pos.use' },
  { href: '/invoices',     label: 'Factures',             icon: 'invoices',     group: 'Vente',    perm: 'customers.read' },
  { href: '/billing',      label: 'Facturation',          icon: 'invoices',     group: 'Vente',    perm: 'customers.read', boOnly: true },
  { href: '/vouchers',     label: 'Avoirs & cartes cadeaux', icon: 'loyalty',    group: 'Vente',    perm: 'pos.use' },
  // Relation
  { href: '/customers',    label: 'Clients',              icon: 'customers',    group: 'Relation', perm: 'customers.read' },
  // Catalogue
  { href: '/products',     label: 'Produits',             icon: 'products',     group: 'Catalogue',perm: 'products.read' },
  { href: '/pricing',      label: 'Gestion de prix',      icon: 'products',     group: 'Catalogue',perm: 'products.write', boOnly: true },
  { href: '/labels',       label: 'Étiquettes',           icon: 'print',        group: 'Catalogue',perm: 'products.read' },
  { href: '/categories',   label: 'Catégories',           icon: 'categories',   group: 'Catalogue',perm: 'products.read' },
  { href: '/suppliers',    label: 'Fournisseurs',         icon: 'truck',        group: 'Catalogue',perm: 'products.read' },
  { href: '/stock',        label: 'Stock',                icon: 'stock',        group: 'Catalogue',perm: 'products.read' },
  { href: '/stock/transfer', label: 'Transfert stock',    icon: 'transfer',     group: 'Catalogue',perm: 'stock.adjust' },
  { href: '/inventory',    label: 'Inventaire',           icon: 'closures',     group: 'Catalogue',perm: 'stock.adjust' },
  // Pilotage (en bas — pas en haut)
  { href: '/dashboard',    label: 'Tableau de bord',      icon: 'dashboard',    group: 'Pilotage', perm: 'settings.read' },
  { href: '/reports',      label: 'Rapports',             icon: 'exports',      group: 'Pilotage', perm: 'settings.read', boOnly: true },
  // Entrées du comptable externe. Elles doivent exister ICI : n'ayant plus
  // `settings.read`, il ne voit plus l'entrée « Paramètres » et n'aurait aucun
  // chemin vers la comptabilité depuis le back-office.
  { href: '/exports',      label: 'Exports comptables',   icon: 'exports',      group: 'Pilotage', perm: 'fiscal.export',   boOnly: true },
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
  const activeHref = activeNavHref(path, visible.map((i) => i.href));

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
                const active = i.href === activeHref;
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
