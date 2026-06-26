'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_ITEMS, type SidebarItem } from './Sidebar';
import { hasPermission, type Role } from '@/lib/auth/rbac';
import { HEADER_TABS_DEFAULT, HEADER_TABS_MAX } from '@/lib/settings/pos-ui';
import Icon from './Icon';

export interface TopBarUser {
  fullName: string;
  role: Role;
}

interface Props {
  user: TopBarUser;
  hiddenPaths: string[];
  headerTabs: string[];
  onOpenMenu: () => void;
  onLogout: () => void;
}

export default function TopBar({ user, hiddenPaths, headerTabs, onOpenMenu, onLogout }: Props) {
  const path = usePathname();

  // Liste effective des onglets : configuration utilisateur (max 10), filtrée
  // par permissions + paths masqués. Vide → on retombe sur la liste par défaut.
  const order = (headerTabs && headerTabs.length > 0 ? headerTabs : HEADER_TABS_DEFAULT)
    .slice(0, HEADER_TABS_MAX);
  const tabs = order
    .map((href) => SIDEBAR_ITEMS.find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i)
    .filter((i) => !i.perm || hasPermission(user.role, i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <header className="sticky top-0 z-40 h-14 shrink-0 flex items-stretch bg-white border-b border-border">
      {/* Logo */}
      <Link href="/caisse" className="flex items-center gap-2.5 pl-4 pr-5 shrink-0 hover:bg-gray-50 transition-colors">
        <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
          F
        </span>
        <span className="font-semibold tracking-tight hidden sm:inline text-ink">Florea POS</span>
      </Link>

      {/* Onglets — style "tab" : actif sur fond accent, sinon ghost */}
      <nav className="flex items-center gap-1 px-2 overflow-x-auto no-scrollbar flex-1">
        {tabs.map((t) => {
          const active = path === t.href || path?.startsWith(t.href + '/');
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex items-center h-10 px-4 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-gray-50'
              }`}
              style={active ? { backgroundColor: 'var(--primary)' } : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Hamburger */}
      <button
        onClick={onOpenMenu}
        aria-label="Ouvrir la vue toutes les pages"
        className="px-4 flex items-center justify-center text-ink-soft hover:text-ink hover:bg-gray-50 transition-colors border-l border-border"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {/* Carte utilisateur */}
      <button
        onClick={onLogout}
        title="Se déconnecter"
        className="relative flex items-center gap-3 px-5 border-l border-border hover:bg-gray-50 transition-colors min-w-[140px]"
      >
        <span
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
          style={{ backgroundColor: 'var(--primary)' }}
        />
        <span className="text-accent-deep">
          <Icon name="users" size={20} />
        </span>
        <span className="text-sm font-medium text-ink">{firstName}</span>
      </button>
    </header>
  );
}
