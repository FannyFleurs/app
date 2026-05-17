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
}

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: '◐' },
  { href: '/caisse',    label: 'Caisse', perm: 'pos.use', icon: '◇' },
  { href: '/products',  label: 'Produits', perm: 'products.read', icon: '◈' },
  { href: '/categories',label: 'Catégories', perm: 'products.read', icon: '◊' },
  { href: '/closures',  label: 'Clôtures', perm: 'closures.daily', icon: '◐' },
  { href: '/fiscal',    label: 'Conformité', perm: 'fiscal.audit', icon: '◉' },
  { href: '/users',     label: 'Utilisateurs', perm: 'users.read', icon: '◎' },
  { href: '/settings',  label: 'Paramètres', perm: 'settings.read', icon: '○' },
];

export default function Sidebar({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <nav className="px-2 pt-2 pb-32 space-y-1">
      {ITEMS.filter((i) => !i.perm || hasPermission(role, i.perm)).map((i) => {
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
    </nav>
  );
}
