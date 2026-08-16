'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref } from '@/lib/nav/active';

const TABS = [
  { href: '/admin/configuration', label: 'Marque & logos' },
  { href: '/admin/configuration/societe', label: 'Société & contact' },
  { href: '/admin/configuration/facturation', label: 'Facturation Stripe' },
  { href: '/admin/configuration/site', label: 'Site public' },
];

export default function ConfigSubNav() {
  const pathname = usePathname();
  // L'onglet racine ne doit pas rester actif sur les sous-pages : c'est
  // l'onglet le plus profond qui l'emporte.
  const activeHref = activeNavHref(pathname, TABS.map((t) => t.href));
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border mb-5">
      {TABS.map((t) => {
        const active = t.href === activeHref;
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
