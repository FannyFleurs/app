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

export interface TopBarSubscription {
  plan: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Props {
  user: TopBarUser;
  hiddenPaths: string[];
  headerTabs: string[];
  subscription: TopBarSubscription | null;
  onOpenMenu: () => void;
  onLogout: () => void;
}

export default function TopBar({
  user, hiddenPaths, headerTabs, subscription, onOpenMenu, onLogout,
}: Props) {
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
    <header className="sticky top-0 z-40 shrink-0 flex items-stretch bg-white border-b border-border pt-safe pl-safe pr-safe min-h-14">
      {/* Logo */}
      <Link href="/caisse" className="flex items-center gap-2.5 pl-4 pr-5 shrink-0 hover:bg-gray-50 transition-colors">
        <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
          F
        </span>
        <span className="font-semibold tracking-tight hidden sm:inline text-ink">Webpos</span>
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

      {/* Pastille abonnement */}
      {subscription && (
        <SubscriptionChip subscription={subscription} />
      )}

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

function SubscriptionChip({ subscription }: { subscription: TopBarSubscription }) {
  const days = subscription.period_end
    ? Math.ceil((new Date(subscription.period_end).getTime() - Date.now()) / 86_400_000)
    : null;

  const isTrial = subscription.plan === 'trial';
  const expiringSoon = days !== null && days >= 0 && days <= 7;
  const expired = days !== null && days < 0;

  const tone =
    expired ? { bg: 'bg-danger/10',  fg: 'text-danger',  bar: '#b42318' }
    : expiringSoon ? { bg: 'bg-warning/10', fg: 'text-warning', bar: '#b7791f' }
    : isTrial ? { bg: 'bg-warning/10', fg: 'text-warning', bar: '#b7791f' }
    : { bg: 'bg-success/10', fg: 'text-success', bar: '#2f6b3f' };

  const label = expired ? 'Abonnement expiré'
    : isTrial ? `Essai · ${days ?? '—'}j`
    : `${capitalize(subscription.plan)}${days !== null ? ` · ${days}j` : ''}`;

  return (
    <Link
      href="/settings/subscription"
      className={`hidden md:flex items-center gap-2 px-3 mx-2 my-2 rounded-xl border border-transparent ${tone.bg} ${tone.fg} hover:opacity-90 transition-opacity`}
      title={subscription.period_end
        ? `Échéance : ${new Date(subscription.period_end).toLocaleDateString('fr-FR')}`
        : 'Voir mon abonnement'}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone.bar }} />
      <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
    </Link>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
