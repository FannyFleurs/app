'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { ROLE_LABELS } from './labels';
import type { Role } from '@/lib/auth/rbac';
import type { PosThemeColor, ColorScheme } from '@/lib/settings/pos-ui';

interface User { id: string; fullName: string; role: Role; email: string }

interface Props {
  user: User;
  themeColor: PosThemeColor;
  colorScheme: ColorScheme;
  initialCollapsed: boolean;
  children: React.ReactNode;
}

export default function AppShell({ user, themeColor, colorScheme, initialCollapsed, children }: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  // Thème de couleur d'accent
  useEffect(() => {
    document.body.setAttribute('data-theme', themeColor);
  }, [themeColor]);

  // Mode clair / sombre / système
  useEffect(() => {
    function applyMode() {
      let mode: 'light' | 'dark' = 'light';
      if (colorScheme === 'dark') mode = 'dark';
      else if (colorScheme === 'system') {
        mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.body.setAttribute('data-mode', mode);
    }
    applyMode();
    if (colorScheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyMode);
      return () => mq.removeEventListener('change', applyMode);
    }
  }, [colorScheme]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `florea_sidebar_collapsed=${next ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`;
  }

  const sidebarWidth = collapsed ? 72 : 260;

  return (
    <div
      className="h-screen overflow-hidden grid"
      style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}
    >
      <aside className="relative border-r border-border bg-white overflow-y-auto transition-[width] duration-200 h-screen">
        <div className="px-3 py-4 sticky top-0 bg-white z-10 border-b border-border/60 flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-bar text-white font-semibold">
              F
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <div className="font-semibold leading-tight">Florea POS</div>
                <div className="text-xs text-ink-soft">Back-office</div>
              </div>
            )}
          </Link>
          <button
            onClick={toggle}
            aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            className="h-9 w-9 grid place-items-center rounded-xl text-ink-soft hover:bg-gray-50 hover:text-ink"
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <Sidebar role={user.role} collapsed={collapsed} />
      </aside>

      <div className="flex flex-col min-w-0 h-screen">
        <TopBar user={user} />
        <main className="flex-1 overflow-auto bg-white">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-20 h-14 bg-white border-b border-border flex items-center px-5 gap-4">
      <div className="ml-auto flex items-center gap-5">
        <Clock />
        <UserBadge user={user} />
      </div>
    </header>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="text-sm text-ink-soft tabular-nums">--:--:--</div>;
  const date = now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="text-right leading-tight">
      <div className="text-sm font-medium capitalize">{date}</div>
      <div className="text-xs text-ink-soft tabular-nums">{time}</div>
    </div>
  );
}

function UserBadge({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = user.fullName
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl pl-2 pr-3 py-1.5 hover:bg-gray-50"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full accent-bar text-white text-xs font-semibold">
          {initials}
        </span>
        <span className="text-left leading-tight">
          <span className="block text-sm font-medium">{user.fullName}</span>
          <span className="block text-xs text-ink-soft">{ROLE_LABELS[user.role]}</span>
        </span>
        <span className="text-ink-soft text-xs">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-56 card p-1.5 z-40">
            <div className="px-3 py-2 border-b border-border">
              <div className="font-medium text-sm truncate">{user.fullName}</div>
              <div className="text-xs text-ink-soft truncate">{user.email}</div>
            </div>
            <Link href="/pos-settings" onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm rounded-lg hover:bg-gray-50">
              ⚙ Paramètres caisse
            </Link>
            <Link href="/settings" onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm rounded-lg hover:bg-gray-50">
              ○ Paramètres organisation
            </Link>
            <button onClick={() => void logout()}
                    className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 text-danger">
              Se déconnecter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
