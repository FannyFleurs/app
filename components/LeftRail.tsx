'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_ITEMS, type SidebarItem } from './Sidebar';
import type { Role, Permission } from '@/lib/auth/rbac';
import { HEADER_TABS_DEFAULT, HEADER_TABS_MAX } from '@/lib/settings/pos-ui';
import Icon from './Icon';

export interface LeftRailUser {
  fullName: string;
  role: Role;
}

interface Props {
  user: LeftRailUser;
  hiddenPaths: string[];
  headerTabs: string[];
  permissions: Set<Permission>;
  onOpenMenu: () => void;
  onLogout: () => void;
}

/**
 * Sidebar verticale gauche facon POS SumUp / Square :
 *   - logo tout en haut
 *   - icones de navigation verticalement centrees
 *   - hamburger + monogramme utilisateur en bas
 * Aucun badge abonnement — la subscription reste accessible via
 * "Toutes les pages" → Paramètres → Abonnement.
 * Visible desktop / tablette uniquement (md:flex) ; TopBar prend
 * le relais sur mobile.
 */
export default function LeftRail({
  user, hiddenPaths, headerTabs, permissions, onOpenMenu, onLogout,
}: Props) {
  const path = usePathname();

  const order = (headerTabs && headerTabs.length > 0 ? headerTabs : HEADER_TABS_DEFAULT)
    .slice(0, HEADER_TABS_MAX);
  const tabs = order
    .map((href) => SIDEBAR_ITEMS.find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i)
    .filter((i) => !i.perm || permissions.has(i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  const initials = user.fullName
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-20 lg:w-24 bg-white border-r border-border h-full pt-safe pb-safe pl-safe"
    >
      {/* Logo */}
      <Link
        href="/caisse"
        className="grid place-items-center h-16 border-b border-border shrink-0"
        title="Caisse"
      >
        <span
          className="grid h-11 w-11 place-items-center rounded-2xl text-white font-semibold text-lg"
          style={{ backgroundColor: 'var(--primary)' }}
        >
          F
        </span>
      </Link>

      {/* Icônes de navigation centrées verticalement */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-2 py-4 overflow-y-auto no-scrollbar">
        {tabs.map((t) => {
          const active = path === t.href || (path?.startsWith(t.href + '/') ?? false);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`group relative grid place-items-center h-14 w-14 lg:h-16 lg:w-16 rounded-2xl transition-colors ${
                active
                  ? 'text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-gray-50'
              }`}
              style={active ? { backgroundColor: 'var(--primary)' } : undefined}
              title={t.label}
              aria-label={t.label}
            >
              <Icon name={t.icon} size={26} />
              {/* Tooltip label au survol */}
              <span
                className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2
                           whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium
                           bg-ink text-white opacity-0 group-hover:opacity-100
                           transition-opacity shadow-md z-50"
                aria-hidden="true"
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Hamburger + monogramme utilisateur en bas */}
      <div className="flex flex-col items-center gap-2 pb-3 border-t border-border pt-3 shrink-0">
        <button
          onClick={onOpenMenu}
          aria-label="Toutes les pages"
          className="grid h-12 w-12 place-items-center rounded-xl border border-border hover:bg-gray-50 text-ink-soft hover:text-ink transition-colors"
          title="Toutes les pages"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <button
          onClick={onLogout}
          className="grid h-12 w-12 place-items-center rounded-full text-white font-semibold text-base hover:opacity-90 transition-opacity"
          style={{ backgroundColor: 'var(--primary)' }}
          title={`${user.fullName} — se déconnecter`}
          aria-label={`${user.fullName} — se déconnecter`}
        >
          {initials}
        </button>
      </div>
    </aside>
  );
}
