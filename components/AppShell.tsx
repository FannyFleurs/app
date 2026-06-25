'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { ROLE_LABELS } from './labels';
import type { Role } from '@/lib/auth/rbac';
import type { PosThemeColor, ColorScheme } from '@/lib/settings/pos-ui';

interface User { id: string; fullName: string; role: Role; email: string }

interface Props {
  user: User;
  themeColor: PosThemeColor;
  colorScheme: ColorScheme;
  hiddenPaths: string[];
  children: React.ReactNode;
}

export default function AppShell({ user, themeColor, colorScheme, hiddenPaths, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const path = usePathname();

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

  // Ferme la sidebar quand on change de page
  useEffect(() => { setSidebarOpen(false); }, [path]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white">
      <TopBar user={user} onLogoClick={() => setSidebarOpen((v) => !v)} sidebarOpen={sidebarOpen} />

      {/* Backdrop pour fermer la sidebar au clic ailleurs */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 top-14 bg-ink/20 z-30"
          aria-hidden="true"
        />
      )}

      {/* Sidebar en overlay */}
      <aside
        className={`fixed top-14 bottom-0 left-0 w-72 bg-white border-r border-border z-40 overflow-y-auto
                    transition-transform duration-200
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar role={user.role} hiddenPaths={hiddenPaths} onItemClick={() => setSidebarOpen(false)} />
      </aside>

      <main className="flex-1 overflow-auto bg-white">{children}</main>
    </div>
  );
}

function TopBar({ user, onLogoClick, sidebarOpen }: {
  user: User; onLogoClick: () => void; sidebarOpen: boolean;
}) {
  return (
    <header className="sticky top-0 z-50 h-14 bg-white border-b border-border flex items-center px-4 gap-3 shrink-0">
      <button
        onClick={onLogoClick}
        className="flex items-center gap-2.5 rounded-xl px-2 py-1 hover:bg-gray-50 transition-colors"
        aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={sidebarOpen}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-bar text-white font-semibold">
          F
        </div>
        <div className="text-left leading-tight hidden sm:block">
          <div className="font-semibold">Florea POS</div>
          <div className="text-xs text-ink-soft">{sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}</div>
        </div>
      </button>

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const initials = user.fullName.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl pl-2 pr-3 py-1.5 hover:bg-gray-50"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full accent-bar text-white text-xs font-semibold">
          {initials}
        </span>
        <span className="text-left leading-tight hidden sm:block">
          <span className="block text-sm font-medium">{user.fullName}</span>
          <span className="block text-xs text-ink-soft">{ROLE_LABELS[user.role]}</span>
        </span>
        <span className="text-ink-soft text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 card p-1.5 z-50">
          <div className="px-3 py-2 border-b border-border">
            <div className="font-medium text-sm truncate">{user.fullName}</div>
            <div className="text-xs text-ink-soft truncate">{user.email}</div>
          </div>
          <Link href="/settings" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm rounded-lg hover:bg-gray-50">
            ⚙ Paramètres
          </Link>
          <button onClick={() => void logout()} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 text-danger">
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}
