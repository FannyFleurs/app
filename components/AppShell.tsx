'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { ROLE_LABELS } from './labels';
import Icon from './Icon';
import type { Role } from '@/lib/auth/rbac';
import type { PosThemeColor, ColorScheme, AutoLogoutMode } from '@/lib/settings/pos-ui';

interface User { id: string; fullName: string; role: Role; email: string }

interface Props {
  user: User;
  themeColor: PosThemeColor;
  colorScheme: ColorScheme;
  hiddenPaths: string[];
  autoLogoutMode: AutoLogoutMode;
  autoLogoutMinutes: number;
  children: React.ReactNode;
}

export default function AppShell({
  user, themeColor, colorScheme, hiddenPaths, autoLogoutMode, autoLogoutMinutes, children,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();

  useEffect(() => { document.body.setAttribute('data-theme', themeColor); }, [themeColor]);

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

  useEffect(() => { setSidebarOpen(false); }, [path]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  // Auto-logout par inactivité (mode 'timer')
  useEffect(() => {
    if (autoLogoutMode !== 'timer' || autoLogoutMinutes <= 0) return;
    let lastActivity = Date.now();
    const events = ['mousedown', 'keydown', 'touchstart'];
    function tick() { lastActivity = Date.now(); }
    events.forEach((e) => window.addEventListener(e, tick));
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity > autoLogoutMinutes * 60_000) {
        void logout();
      }
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, tick));
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogoutMode, autoLogoutMinutes]);

  // Auto-logout après chaque vente : émis par un événement personnalisé
  useEffect(() => {
    if (autoLogoutMode !== 'after_sale') return;
    function onSale() { void logout(); }
    window.addEventListener('florea:sale_validated', onSale);
    return () => window.removeEventListener('florea:sale_validated', onSale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogoutMode]);

  const onCaisse = path === '/caisse' || path?.startsWith('/caisse/');

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white">
      <header className="sticky top-0 z-50 h-14 bg-white border-b border-border flex items-center px-4 gap-3 shrink-0 relative">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1 hover:bg-gray-50 transition-colors"
          aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl accent-bar text-white font-semibold">
            F
          </div>
          <div className="text-left leading-tight hidden sm:block">
            <div className="font-semibold">Florea POS</div>
            <div className="text-xs text-ink-soft">{sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}</div>
          </div>
        </button>

        {/* Bouton flottant centré : Retour caisse OU prénom utilisateur (déconnexion) sur /caisse */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {onCaisse ? (
            <button
              onClick={() => void logout()}
              className="pointer-events-auto flex items-center gap-2 rounded-full pl-2 pr-4 py-1.5 text-sm font-medium shadow-md border border-border bg-white hover:bg-gray-50"
              title="Cliquer pour changer d'utilisateur"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full accent-bar text-white text-xs font-semibold">
                {user.fullName.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
              </span>
              {user.fullName.split(/\s+/)[0]}
            </button>
          ) : (
            <Link
              href="/caisse"
              className="pointer-events-auto flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium shadow-md accent-bar text-white"
            >
              <Icon name="pos" size={18} />
              Retour caisse
            </Link>
          )}
        </div>

        {/* Date/heure complètement à droite */}
        <div className="ml-auto">
          <Clock />
        </div>
      </header>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 top-14 bg-ink/20 z-30"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-14 bottom-0 left-0 w-72 bg-white border-r border-border z-40 overflow-y-auto
                    transition-transform duration-200 flex flex-col
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex-1 overflow-y-auto">
          <Sidebar role={user.role} hiddenPaths={hiddenPaths} onItemClick={() => setSidebarOpen(false)} />
        </div>
        <div className="border-t border-border p-3 bg-white sticky bottom-0">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full accent-bar text-white text-sm font-semibold shrink-0">
              {user.fullName.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.fullName}</div>
              <div className="text-xs text-ink-soft truncate">{ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <button
            onClick={() => void logout()}
            className="mt-3 w-full btn-ghost text-sm text-danger"
          >
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-white">{children}</main>
    </div>
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
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="text-right leading-tight">
      <div className="text-sm font-medium capitalize">{date}</div>
      <div className="text-xs text-ink-soft tabular-nums">{time}</div>
    </div>
  );
}
