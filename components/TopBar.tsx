'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_ITEMS, type SidebarItem } from './Sidebar';
import { hasPermission, type Role } from '@/lib/auth/rbac';
import Icon from './Icon';

/**
 * Identifiants (href) des items affichés comme onglets dans la barre supérieure.
 * Les autres restent accessibles via le menu hamburger.
 */
const TOP_TABS_ORDER: string[] = [
  '/caisse',       // Accueil
  '/orders',       // Tickets / commandes
  '/ma-journee',   // Ma journée
  '/stock',        // Gestion du stock
  '/gift-cards',   // Avoir / Bon cadeau
  '/customers',    // Comptes clients
];

export interface TopBarUser {
  fullName: string;
  role: Role;
}

interface Props {
  user: TopBarUser;
  hiddenPaths: string[];
  onOpenMenu: () => void;
  onLogout: () => void;
}

export default function TopBar({ user, hiddenPaths, onOpenMenu, onLogout }: Props) {
  const path = usePathname();

  const tabs = TOP_TABS_ORDER
    .map((href) => SIDEBAR_ITEMS.find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i)
    .filter((i) => !i.perm || hasPermission(user.role, i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  const initials = user.fullName
    .split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;

  return (
    <header
      className="sticky top-0 z-40 h-14 shrink-0 flex items-stretch text-white"
      style={{ backgroundColor: 'var(--topbar-bg)' }}
    >
      {/* Logo */}
      <Link href="/caisse" className="flex items-center gap-2.5 pl-4 pr-5 shrink-0">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white font-semibold">
          F
        </span>
        <span className="font-semibold tracking-tight hidden sm:inline">Florea POS</span>
      </Link>

      {/* Onglets */}
      <nav className="flex items-stretch gap-0 overflow-x-auto no-scrollbar flex-1">
        {tabs.map((t) => {
          const active = path === t.href || path?.startsWith(t.href + '/');
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`relative flex items-center gap-2 px-4 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/75 hover:text-white hover:bg-white/5'
              }`}
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
        className="px-4 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
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
        className="relative flex items-center gap-3 px-5 border-l border-white/10 hover:bg-white/5 transition-colors min-w-[140px]"
        style={{ backgroundColor: 'var(--topbar-user-bg)' }}
      >
        <span
          className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
          style={{ backgroundColor: 'var(--primary)' }}
        />
        <span className="text-white/90">
          <Icon name="users" size={20} />
        </span>
        <span className="text-sm font-medium text-white">{firstName}</span>
        <span className="sr-only">{initials}</span>
      </button>
    </header>
  );
}
