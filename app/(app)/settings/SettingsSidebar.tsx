'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';

interface Item {
  href: string;
  label: string;
  icon: IconName;
}

export default function SettingsSidebar({ items }: { items: Item[] }) {
  const path = usePathname();
  return (
    <nav className="p-2 space-y-0.5">
      {items.map((i) => {
        const active = path === i.href || path.startsWith(i.href + '/');
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-accent-soft text-accent-deep'
                : 'text-ink-soft hover:bg-gray-50 hover:text-ink'
            }`}
          >
            <span className="text-accent-deep"><Icon name={i.icon} size={20} /></span>
            <span className="truncate">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
