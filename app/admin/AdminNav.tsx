'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref } from '@/lib/nav/active';

const ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/organizations', label: 'Organisations' },
  { href: '/admin/messages', label: 'Demandes de contact' },
  { href: '/admin/support', label: 'Demandes d’assistance' },
  { href: '/admin/promo-codes', label: 'Codes' },
  { href: '/admin/configuration', label: 'Configuration' },
  { href: '/admin/health', label: 'Santé & quota' },
  { href: '/admin/fiscal', label: 'Conformité (technique)' },
];

export default function AdminNav() {
  const pathname = usePathname();
  // Une seule entrée active : la plus profonde. « Dashboard » (/admin) n'a
  // ainsi plus besoin d'une exception écrite à la main.
  const activeHref = activeNavHref(pathname, ITEMS.map((i) => i.href));
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {ITEMS.map((it) => {
        const active = it.href === activeHref;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-gray-100 text-ink'
                : 'text-ink-soft hover:bg-gray-50 hover:text-ink'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
