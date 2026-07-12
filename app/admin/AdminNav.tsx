'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/organizations', label: 'Organisations' },
  { href: '/admin/promo-codes', label: 'Codes' },
  { href: '/admin/configuration', label: 'Configuration' },
  { href: '/admin/health', label: 'Santé & quota' },
  { href: '/admin/fiscal', label: 'Conformité (technique)' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {ITEMS.map((it) => {
        const active =
          it.href === '/admin' ? pathname === '/admin' : pathname?.startsWith(it.href);
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
