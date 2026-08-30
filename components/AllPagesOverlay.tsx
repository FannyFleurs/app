'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useEffect } from 'react';
import Link from 'next/link';
import { SIDEBAR_ITEMS } from './Sidebar';
import type { Role, Permission } from '@/lib/auth/rbac';
import Icon from './Icon';
import { useBrand } from './BrandMark';
import { useSchoolMode, activateSchoolMode, deactivateSchoolMode } from '@/lib/school-mode';

interface Props {
  role: Role;
  hiddenPaths: string[];
  permissions: Set<Permission>;
  backOffice?: boolean;
  onClose: () => void;
  onLogout: () => void;
}

const GROUP_ORDER = ['Vente', 'Relation', 'Catalogue', 'Pilotage', 'Système', 'Assistance'];

export default function AllPagesOverlay({ role, hiddenPaths, permissions, backOffice = false, onClose, onLogout }: Props) {
  const schoolActive = useSchoolMode();
  const brand = useBrand();

  async function toggleSchool() {
    if (schoolActive) {
      if (!(await confirmThemed({ message: 'Quitter le mode école ?\n\nToutes les ventes fictives et données de démonstration vont être supprimées.' }))) return;
      deactivateSchoolMode();
      onClose();
      window.location.reload();
      return;
    }
    if (!(await confirmThemed({ title: 'Activer le mode école',
      message: 'Dans ce mode, AUCUNE vente ne sera enregistrée. Toutes les actions sont uniquement locales et seront supprimées en sortant.\n\nUtile pour former un nouvel employé sans polluer la caisse réelle.',
    }))) return;
    activateSchoolMode();
    onClose();
    window.location.reload();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  void role; // gardé dans la signature pour compat future
  const visible = SIDEBAR_ITEMS
    .filter((i) => backOffice || !i.boOnly)
    .filter((i) => !backOffice || !i.appOnly)
    .filter((i) => !i.perm || permissions.has(i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  return (
    // On laisse le rail gauche visible : l'overlay démarre après lui sur
    // desktop (md:left-20 / lg:left-24), afin que le logo et la navigation
    // restent au même endroit que sur les autres pages. Sur mobile (pas de
    // rail), il couvre tout l'écran.
    <div className="fixed inset-y-0 right-0 left-0 md:left-20 lg:left-24 z-[60] flex flex-col bg-white animate-[fadeIn_120ms_ease-out] pt-safe pb-safe pl-safe pr-safe">
      <div className="h-14 flex items-center px-4 shrink-0 border-b border-border bg-white">
        {/* Logo affiché uniquement sur mobile : sur desktop, le rail gauche
            (toujours visible) porte déjà le logo. */}
        <div className="flex items-center gap-2.5 md:hidden">
          {/* Le logo, ou rien : aucun repli. */}
          {brand.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={brand.brand_name || 'Logo'} className="h-10 w-auto max-w-[170px] object-contain" />
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onLogout} className="btn-ghost text-sm text-danger">
            Se déconnecter
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border hover:bg-gray-50 transition-colors text-lg text-ink-soft"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Fond gris sur mobile : ce sont les cartes blanches qui portent les
          entrées, et il faut qu'elles se détachent. Sur grand écran la grille
          de tuiles reste sur fond blanc, comme avant. */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-10 py-6 sm:py-10 bg-bg sm:bg-white">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">Toutes les pages</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sélectionnez une section. Échap ou ✕ pour revenir.
        </p>

        {/* MOBILE — liste groupée : sur un téléphone tenu d'une main, une
            grille de vignettes carrées oblige à viser ; une ligne pleine
            largeur se lit et se touche sans effort. */}
        <div className="mt-5 space-y-6 sm:hidden">
          {GROUP_ORDER.map((group) => {
            const items = visible.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <h2 className="px-1 pb-2 text-sm font-medium text-accent-deep">{group}</h2>
                <div className="rounded-2xl bg-white border border-border overflow-hidden divide-y divide-border/70">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-3.5 py-3.5 active:bg-gray-50"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-deep">
                        <Icon name={item.icon} size={19} />
                      </span>
                      <span className="flex-1 min-w-0 font-medium text-ink truncate">{item.label}</span>
                      <Chevron />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          <section>
            <h2 className="px-1 pb-2 text-sm font-medium text-accent-deep">Outils</h2>
            <div className="rounded-2xl bg-white border border-border overflow-hidden">
              <button
                onClick={toggleSchool}
                className="w-full flex items-center gap-3 px-3.5 py-3.5 text-left active:bg-gray-50"
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  schoolActive ? 'bg-warning text-white' : 'bg-accent-soft text-accent-deep'
                }`}>
                  <Icon name="sparkle" size={19} />
                </span>
                <span className="flex-1 min-w-0 font-medium text-ink truncate">
                  Mode école{schoolActive ? ' · actif' : ''}
                </span>
                <Chevron />
              </button>
            </div>
          </section>
        </div>

        <div className="mt-6 space-y-6 hidden sm:block">
          {GROUP_ORDER.map((group) => {
            const items = visible.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">
                  {group}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="group card p-2 flex flex-col items-center justify-center text-center aspect-[4/3] hover:shadow-md hover:border-gray-300 transition-all"
                    >
                      <span
                        className="grid h-8 w-8 place-items-center rounded-lg mb-1 bg-accent-soft text-accent-deep group-hover:scale-105 transition-transform"
                      >
                        <Icon name={item.icon} size={18} />
                      </span>
                      <span className="text-[11px] font-medium leading-tight text-ink line-clamp-2">
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Outils transverses (mode école) : place tout en bas car
            rarement utilisé et pouvant induire en erreur si a proximite
            des vraies pages metier. */}
        <section className="mt-10 pt-6 border-t border-border hidden sm:block">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-2">
            Outils
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            <button
              onClick={toggleSchool}
              className={`card p-2 flex flex-col items-center justify-center text-center aspect-[4/3] transition-all hover:shadow-md hover:border-gray-300 ${
                schoolActive ? 'border-warning bg-warning/10' : ''
              }`}
              title={schoolActive
                ? 'Le mode école est actif. Cliquez pour le désactiver.'
                : 'Activer le mode école (formation, aucune vente enregistrée).'}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg mb-1 transition-transform group-hover:scale-105 ${
                  schoolActive ? 'bg-warning text-white' : 'bg-accent-soft text-accent-deep'
                }`}
              >
                <Icon name="sparkle" size={18} />
              </span>
              <span className="text-[11px] font-medium leading-tight text-ink line-clamp-2">
                Mode école {schoolActive && '· ON'}
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Chevron de fin de ligne : il dit qu'on ouvre une page, pas qu'on coche. */
function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
         className="shrink-0 text-ink-soft/50" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
