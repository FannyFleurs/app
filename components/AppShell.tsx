'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopBar from './TopBar';
import LeftRail from './LeftRail';
import AllPagesOverlay from './AllPagesOverlay';
import WakeLockKeeper from './WakeLockKeeper';
import PaidOrderNotifier from './PaidOrderNotifier';
import SchoolModeBanner from './SchoolModeBanner';
import PosteRefBadge from './PosteRefBadge';
import type { Role, Permission } from '@/lib/auth/rbac';
import { POS_THEME_COLOR_VALUES, type PosThemeColor, type ColorScheme, type AutoLogoutMode } from '@/lib/settings/pos-ui';

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
  permissions: Permission[];
  /**
   * Vue back-office (sous-domaine bo.) : sidebar en menu complet,
   * pas de bouton caisse, quelques pages supplementaires (Societe).
   */
  backOffice?: boolean;
  children: React.ReactNode;
}

export default function AppShell({
  user, themeColor, colorScheme, hiddenPaths, autoLogoutMode, autoLogoutMinutes, headerTabs,
  subscription, permissions, backOffice = false, children,
}: Props) {
  const permSet = new Set(permissions);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  useEffect(() => { document.body.setAttribute('data-theme', themeColor); }, [themeColor]);

  // Synchronise la meta theme-color (barre systeme iOS/Android + chrome
  // Safari macOS) avec la couleur d'accent selectionnee. Si la couleur
  // n'est pas trouvee, on retombe sur blanc.
  useEffect(() => {
    const hex = POS_THEME_COLOR_VALUES[themeColor]?.main ?? '#FFFFFF';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = hex;
  }, [themeColor]);

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
    window.addEventListener('webpos:sale_validated', onSale);
    return () => window.removeEventListener('webpos:sale_validated', onSale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogoutMode]);

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white pt-safe pl-safe pr-safe pb-safe">
      <SchoolModeBanner />
      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        {/* Sidebar verticale (desktop / tablette) */}
        <LeftRail
          user={{ fullName: user.fullName, role: user.role }}
          hiddenPaths={hiddenPaths}
          headerTabs={headerTabs}
          permissions={permSet}
          onOpenMenu={() => setMenuOpen(true)}
          onLogout={() => void logout()}
          backOffice={backOffice}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* TopBar mobile uniquement — le rail vertical prend le relais dès md */}
          <div className="md:hidden">
            <TopBar
              user={{ fullName: user.fullName, role: user.role }}
              hiddenPaths={hiddenPaths}
              headerTabs={headerTabs}
              subscription={subscription}
              permissions={permSet}
              onOpenMenu={() => setMenuOpen(true)}
              onLogout={() => void logout()}
            />
          </div>

          {/* Scroll vertical autorisé par défaut sur toutes les pages.
              Les pages à mise en page fixe (CAISSE) appliquent leur propre
              overflow-hidden + h-full pour ne pas scroller. */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-white relative">{children}</main>
        </div>
      </div>

      {menuOpen && (
        <AllPagesOverlay
          role={user.role}
          hiddenPaths={hiddenPaths}
          permissions={permSet}
          onClose={() => setMenuOpen(false)}
          onLogout={() => void logout()}
        />
      )}

      {/* Référence du poste (caisse + paramètres, en bas à droite) */}
      <PosteRefBadge />

      {/* Maintient l'écran allumé tant que l'app est ouverte (iPad PWA) */}
      <WakeLockKeeper />

      {/* Notifications temps réel : paiement Stripe validé */}
      <PaidOrderNotifier />
    </div>
  );
}
