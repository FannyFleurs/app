'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopBar from './TopBar';
import AllPagesOverlay from './AllPagesOverlay';
import type { Role } from '@/lib/auth/rbac';
import type { PosThemeColor, ColorScheme, AutoLogoutMode } from '@/lib/settings/pos-ui';

interface User { id: string; fullName: string; role: Role; email: string }

export interface SubscriptionInfo {
  plan: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Props {
  user: User;
  themeColor: PosThemeColor;
  colorScheme: ColorScheme;
  hiddenPaths: string[];
  autoLogoutMode: AutoLogoutMode;
  autoLogoutMinutes: number;
  headerTabs: string[];
  subscription: SubscriptionInfo | null;
  children: React.ReactNode;
}

export default function AppShell({
  user, themeColor, colorScheme, hiddenPaths, autoLogoutMode, autoLogoutMinutes, headerTabs,
  subscription, children,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
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

  // Auto-logout après chaque vente
  useEffect(() => {
    if (autoLogoutMode !== 'after_sale') return;
    function onSale() { void logout(); }
    window.addEventListener('florea:sale_validated', onSale);
    return () => window.removeEventListener('florea:sale_validated', onSale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogoutMode]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white">
      <TopBar
        user={{ fullName: user.fullName, role: user.role }}
        hiddenPaths={hiddenPaths}
        headerTabs={headerTabs}
        subscription={subscription}
        onOpenMenu={() => setMenuOpen(true)}
        onLogout={() => void logout()}
      />

      <main className="flex-1 overflow-hidden bg-white relative">{children}</main>

      {menuOpen && (
        <AllPagesOverlay
          role={user.role}
          hiddenPaths={hiddenPaths}
          onClose={() => setMenuOpen(false)}
          onLogout={() => void logout()}
        />
      )}
    </div>
  );
}
