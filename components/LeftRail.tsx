'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SIDEBAR_ITEMS, type SidebarItem } from './Sidebar';
import type { Role, Permission } from '@/lib/auth/rbac';
import { HEADER_TABS_DEFAULT, HEADER_TABS_MAX } from '@/lib/settings/pos-ui';
import { activeNavHref } from '@/lib/nav/active';
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

const BO_GROUP_ORDER = ['Vente', 'Relation', 'Catalogue', 'Pilotage', 'Système', 'Assistance'];

/** Repli du rail : mémorisé par poste, pas par utilisateur. */
const RAIL_COLLAPSED_KEY = 'webpos_bo_rail_collapsed';

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
  // Rail replié : le choix suit l'utilisateur d'une page à l'autre, sinon il
  // faudrait le refaire à chaque navigation — autant ne pas proposer le repli.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'); } catch { /* privé */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* privé */ }
      return next;
    });
  }

  const order = (headerTabs && headerTabs.length > 0 ? headerTabs : HEADER_TABS_DEFAULT)
    .slice(0, HEADER_TABS_MAX);
  const tabs = order
    .map((href) => SIDEBAR_ITEMS.find((i) => i.href === href))
    .filter((i): i is SidebarItem => !!i)
    .filter((i) => backOffice || !i.boOnly)
    .filter((i) => !i.perm || permissions.has(i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  // En back-office : menu complet, groupe par rubrique, sans caisse.
  const boItems = SIDEBAR_ITEMS
    .filter((i) => i.href !== '/caisse')
    .filter((i) => !i.appOnly)
    .filter((i) => !i.perm || permissions.has(i.perm));

  // Une seule entrée allumée à la fois, calculée sur la liste affichée.
  const boActive = activeNavHref(path, boItems.map((i) => i.href));
  const tabActive = activeNavHref(path, tabs.map((t) => t.href));

  const initials = user.fullName
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

  if (backOffice) {
    return (
      // Rail plein vert : c'est lui qui pose l'identité de l'écran. Le blanc
      // était neutre au point de disparaître, et l'élément actif — seul aplat
      // de couleur — se confondait avec un bouton.
      <aside
        className={`hidden md:flex flex-col shrink-0 h-full text-white/85 transition-[width] duration-150 ${
          collapsed ? 'w-16' : 'w-56 lg:w-60'
        }`}
        style={{ backgroundColor: 'var(--primary)' }}
      >
        {/* Logo + titre back-office. Replié, seul le monogramme reste. */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 h-14 shrink-0 ${collapsed ? 'justify-center px-0' : 'px-3'}`}
          title="Back-office"
        >
          {/* Pas de monogramme « H » : uniquement le logo configuré. */}
          {(brand.bo_logo_url || brand.logo_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.bo_logo_url || brand.logo_url} alt={brand.brand_name} className="h-10 w-auto max-w-[140px] object-contain shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight truncate text-white">Back-office</div>
              <div className="text-[10px] leading-tight truncate text-white/55">Gestion à distance</div>
            </div>
          )}
        </Link>

        {/* Repli : flèche vers la gauche pour fermer, vers la droite pour
            rouvrir. Le sens de la flèche dit ce qui VA se passer, pas l'état
            courant — c'est ce qu'on lit d'instinct sur un bouton. */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Ouvrir le menu' : 'Fermer le menu'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Ouvrir le menu' : 'Fermer le menu'}
          className={`mx-2 mb-1 flex h-7 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-colors ${
            collapsed ? 'w-12' : 'self-end w-8'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={collapsed ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} />
          </svg>
        </button>

        {/* Interlignes resserrés : le rail liste vingt entrées, l'espace
            gagné évite de le faire défiler pour atteindre « Paramètres ». */}
        <nav className="flex-1 overflow-y-auto py-1 space-y-2.5 overflow-x-hidden">
          {BO_GROUP_ORDER.map((g) => {
            const items = boItems.filter((i) => i.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="px-2">
                {collapsed ? (
                  <div className="mx-3 mb-1 h-px bg-white/15" />
                ) : (
                  <div className="px-3 mb-0.5 text-[9px] uppercase tracking-widest text-white/45 font-semibold">
                    {g}
                  </div>
                )}
                <div className="space-y-px">
                  {items.map((i) => {
                    const active = i.href === boActive;
                    return (
                      <Link
                        key={i.href}
                        href={i.href}
                        // Actif = pastille jaune, texte vert : le seul endroit
                        // clair du rail, on le trouve sans le chercher.
                        title={collapsed ? i.label : undefined}
                        className={`flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                          collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5'
                        } ${active ? '' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
                        style={active
                          ? { backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }
                          : undefined}
                      >
                        <Icon name={i.icon} size={18} />
                        {!collapsed && <span className="truncate">{i.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/15 px-2 py-3 space-y-1.5 shrink-0">
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-2 rounded-xl py-1.5 hover:bg-white/10 text-sm text-left transition-colors ${
              collapsed ? 'justify-center px-0' : 'px-2.5'
            }`}
            title={`${user.fullName} — se déconnecter`}
          >
            <span
              className="grid h-8 w-8 place-items-center rounded-full font-semibold text-xs shrink-0"
              style={{ backgroundColor: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              {initials}
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate font-medium text-[13px] text-white">{user.fullName}</div>
                <div className="truncate text-[10px] text-white/55">Se déconnecter</div>
              </div>
            )}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 w-20 lg:w-24 bg-white h-full relative z-30 border-r border-border"
    >
      {/* Logo en haut du rail, au format carré à coins arrondis (façon icône
          d'app). Contenu DANS le rail (plus de débordement vers les titres de
          page). Hauteur du bloc constante quelle que soit la route pour ne pas
          décaler la nav centrée en dessous. */}
      <Link
        href="/caisse"
        className="flex items-center justify-center shrink-0 h-20"
        title="Caisse"
      >
        {/* Pas de monogramme « H » : uniquement le logo configuré. */}
        {brand.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo_url}
            alt={brand.brand_name}
            className="h-14 w-14 rounded-2xl object-cover"
          />
        )}
      </Link>

      {/* Icônes de navigation centrées verticalement.
          `overflow-x-hidden` explicite : en CSS, un `overflow-y` non-visible
          force le navigateur à calculer `overflow-x: auto`. Le rail devenait
          alors défilable latéralement et glissait sous le doigt ou le
          trackpad. On clôt la question ici plutôt que de compter sur le fait
          qu'aucun enfant ne dépassera jamais. */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-2 py-4 overflow-y-auto overflow-x-hidden no-scrollbar">
        {tabs.map((t) => {
          const active = t.href === tabActive;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 w-16 lg:w-[4.75rem] min-h-[56px] py-1.5 px-1 rounded-2xl transition-colors ${
                active
                  ? 'text-white shadow-sm font-semibold'
                  : 'text-ink-soft hover:text-ink hover:bg-gray-100'
              }`}
              style={active ? { backgroundColor: 'var(--primary)' } : undefined}
              title={t.label}
              aria-label={t.label}
            >
              <Icon name={t.icon} size={22} />
              {/* Libellé sous l'icône, tronqué si long. Le texte complet reste
                  accessible par l'infobulle native (`title`) et aux lecteurs
                  d'écran (`aria-label`) — une infobulle maison en position
                  absolue débordait du rail et le rendait défilable. */}
              <span className="text-[10px] leading-tight text-center max-w-full truncate">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Assistance + hamburger + monogramme utilisateur en bas */}
      <div className="flex flex-col items-center gap-2 pb-3 border-t border-border pt-3 shrink-0">
        {/* Toujours là, quelle que soit la configuration des onglets : quand la
            caisse s'arrête, signaler la panne ne doit pas commencer par
            ouvrir un menu. */}
        {permissions.has('support.request') ? (
          <Link
            href="/support"
            aria-current={path.startsWith('/support') ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 w-16 lg:w-[4.75rem] min-h-[56px] py-1.5 px-1 rounded-2xl transition-colors ${
              path.startsWith('/support')
                ? 'text-white shadow-sm font-semibold'
                : 'text-ink-soft hover:text-ink hover:bg-gray-100'
            }`}
            style={path.startsWith('/support') ? { backgroundColor: 'var(--primary)' } : undefined}
            title="Assistance"
            aria-label="Assistance"
          >
            <Icon name="comment" size={22} />
            <span className="text-[10px] leading-tight text-center max-w-full truncate">Assistance</span>
          </Link>
        ) : null}
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
