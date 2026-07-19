'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/configuration', label: 'Marque & logos' },
  { href: '/admin/configuration/societe', label: 'Société & contact' },
  { href: '/admin/configuration/facturation', label: 'Facturation Stripe' },
];

export default function ConfigSubNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border mb-5">
      {TABS.map((t) => {
        // L'onglet racine ne doit s'activer que sur l'URL exacte, sinon il
        // reste actif sur les sous-pages.
        const active = t.href === '/admin/configuration'
          ? pathname === '/admin/configuration'
          : pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              active
                ? 'border-[var(--accent,#556B3E)] text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
