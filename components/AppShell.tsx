'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import TopBar from './TopBar';
import LeftRail from './LeftRail';
import AllPagesOverlay from './AllPagesOverlay';
import WakeLockKeeper from './WakeLockKeeper';
import PaidOrderNotifier from './PaidOrderNotifier';
import SchoolModeBanner from './SchoolModeBanner';
import SessionKeepAlive from './SessionKeepAlive';
import type { Role, Permission } from '@/lib/auth/rbac';
import { BRAND_THEME, POS_THEME_COLOR_VALUES, type AutoLogoutMode } from '@/lib/settings/pos-ui';

interface User { id: string; fullName: string; role: Role; email: string }

export interface SubscriptionInfo {
  plan: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
}

interface Props {
  user: User;
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
  user, hiddenPaths, autoLogoutMode, autoLogoutMinutes, headerTabs,
  subscription, permissions, backOffice = false, children,
}: Props) {
  const permSet = new Set(permissions);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Couleur d'accent effective : celle choisie AU POSTE (localStorage) prime
  // sur celle de l'organisation. Se met à jour en direct quand le poste change
  // sa couleur (événement) ou depuis un autre onglet (storage).
  /**
   * Un seul habillage : celui de la marque, en clair.
   *
   * La couleur d'accent et le mode sombre étaient réglables par poste. Deux
   * caisses côte à côte pouvaient afficher deux verts différents, et chaque
   * écran ajouté devait être vérifié dans quatre combinaisons. HelloPos a
   * maintenant une identité, elle ne se négocie plus poste par poste.
   */
  const appliedTheme = BRAND_THEME;
  useEffect(() => {
    document.body.setAttribute('data-theme', appliedTheme);
    document.body.setAttribute('data-mode', 'light');
  }, [appliedTheme]);

  // Le rail gauche reste visible sous l'overlay « Toutes les pages ». Si
  // l'utilisateur clique un item du rail, la route change : on referme alors
  // l'overlay pour révéler la page demandée.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Synchronise la meta theme-color (barre systeme iOS/Android, titre de
  // fenêtre PWA macOS/Windows) avec la couleur d'accent du thème : le
  // bandeau coloré reste présent sur TOUTES les pages de l'app.
  //
  // IMPORTANT : la dépendance à `pathname` est indispensable. Next.js
  // ré-applique la `themeColor` du viewport racine (#FFFFFF) sur CHAQUE
  // navigation client. Sans re-run à chaque changement de route, le bandeau
  // coloré disparaissait à la 1re navigation et ne revenait jamais. On
  // ré-affirme donc la couleur d'accent après chaque navigation.
  useEffect(() => {
    const hex = POS_THEME_COLOR_VALUES[BRAND_THEME]?.main ?? '#FFFFFF';
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = hex;
  }, [pathname]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  // Auto-logout par inactivité (mode 'timer').
  // Fonctionnalité de sécurité pour la CAISSE (poste partagé) : on ne l'applique
  // PAS au back-office, où une déconnexion en pleine saisie n'a pas de sens.
  useEffect(() => {
    if (backOffice) return;
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

  // Auto-logout après chaque vente (caisse uniquement, jamais en back-office)
  useEffect(() => {
    if (backOffice) return;
    if (autoLogoutMode !== 'after_sale') return;
    function onSale() { void logout(); }
    window.addEventListener('webpos:sale_validated', onSale);
    return () => window.removeEventListener('webpos:sale_validated', onSale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogoutMode]);

  return (
    <div className="h-app overflow-hidden flex flex-col bg-bg pt-safe pl-safe pr-safe pb-safe">
      <SessionKeepAlive />
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
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bg relative">{children}</main>
        </div>
      </div>

      {menuOpen && (
        <AllPagesOverlay
          role={user.role}
          hiddenPaths={hiddenPaths}
          permissions={permSet}
          backOffice={backOffice}
          onClose={() => setMenuOpen(false)}
          onLogout={() => void logout()}
        />
      )}

      {/* Maintient l'écran allumé tant que l'app est ouverte (iPad PWA) */}
      <WakeLockKeeper />

      {/* Notifications temps réel : paiement Stripe validé */}
      <PaidOrderNotifier />
    </div>
  );
}
