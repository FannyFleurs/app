'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_ITEMS, type SidebarItem } from './Sidebar';
import type { Role, Permission } from '@/lib/auth/rbac';
import { HEADER_TABS_DEFAULT, HEADER_TABS_MAX } from '@/lib/settings/pos-ui';
import Icon from './Icon';
import { useBrand } from './BrandMark';

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
  /** Vue back-office : menu complet avec libelles, sans caisse. */
  backOffice?: boolean;
}

const BO_GROUP_ORDER = ['Vente', 'Relation', 'Catalogue', 'Pilotage', 'Système'];

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
  user, hiddenPaths, headerTabs, permissions, onOpenMenu, onLogout, backOffice = false,
}: Props) {
  const path = usePathname();
  const brand = useBrand();

  const order = (headerTabs && headerTabs.length > 0 ? headerTabs : HEADER_TABS_DEFAULT)
    .slice(0, HEADER_TABS_MAX);
  const tabs = order
    .map((href) => SIDEBAR_ITEMS.find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i)
    .filter((i) => !i.perm || permissions.has(i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  // En back-office : menu complet, groupe par rubrique, sans caisse.
  const boItems = SIDEBAR_ITEMS
    .filter((i) => i.href !== '/caisse')
    .filter((i) => !i.perm || permissions.has(i.perm));

  const initials = user.fullName
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  if (backOffice) {
    return (
      <aside className="hidden md:flex flex-col shrink-0 w-60 lg:w-64 bg-white border-r border-border h-full">
        {/* Logo + titre back-office */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-4 h-16 shrink-0"
          title="Back-office"
        >
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={brand.brand_name} className="h-10 w-10 rounded-2xl object-contain shrink-0" />
          ) : (
            <span
              className="grid h-10 w-10 place-items-center rounded-2xl text-white font-semibold text-lg shrink-0"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {(brand.brand_name || 'H').charAt(0)}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">Back-office</div>
            <div className="text-[11px] text-ink-soft leading-tight truncate">Gestion à distance</div>
          </div>
        </Link>

        <nav className="flex-1 overflow-y-auto py-3 space-y-4">
          {BO_GROUP_ORDER.map((g) => {
            const items = boItems.filter((i) => i.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="px-2">
                <div className="px-3 mb-1 text-[10px] uppercase tracking-widest text-ink-soft/60 font-semibold">
                  {g}
                </div>
                <div className="space-y-0.5">
                  {items.map((i) => {
                    const active = path === i.href || (path?.startsWith(i.href + '/') ?? false);
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? 'text-white shadow-sm'
                            : 'text-ink-soft hover:bg-gray-50 hover:text-ink'
                        }`}
                        style={active ? { backgroundColor: 'var(--primary)' } : undefined}
                      >
                        <Icon name={i.icon} size={20} />
                        <span className="truncate">{i.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-border px-2 py-3 space-y-1.5 shrink-0">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-gray-50 text-sm text-left"
            title={`${user.fullName} — se déconnecter`}
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-white font-semibold text-xs shrink-0"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{user.fullName}</div>
              <div className="truncate text-[11px] text-ink-soft">Se déconnecter</div>
            </div>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-20 lg:w-24 bg-white border-r border-border h-full"
    >
      {/* Logo */}
      <Link
        href="/caisse"
        className="grid place-items-center h-16 shrink-0"
        title="Caisse"
      >
        {brand.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.logo_url} alt={brand.brand_name} className="h-11 w-11 rounded-2xl object-contain" />
        ) : (
          <span
            className="grid h-11 w-11 place-items-center rounded-2xl text-white font-semibold text-lg"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {(brand.brand_name || 'H').charAt(0)}
          </span>
        )}
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
