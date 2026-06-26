'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { SIDEBAR_ITEMS } from './Sidebar';
import { hasPermission, type Role } from '@/lib/auth/rbac';
import Icon from './Icon';

interface Props {
  role: Role;
  hiddenPaths: string[];
  onClose: () => void;
  onLogout: () => void;
}

const GROUP_ORDER = ['Vente', 'Relation', 'Catalogue', 'Pilotage', 'Système'];

export default function AllPagesOverlay({ role, hiddenPaths, onClose, onLogout }: Props) {
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

  const visible = SIDEBAR_ITEMS
    .filter((i) => !i.perm || hasPermission(role, i.perm))
    .filter((i) => i.required || !hiddenPaths.includes(i.href));

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col text-white animate-[fadeIn_120ms_ease-out]"
      style={{ backgroundColor: 'var(--topbar-bg)' }}
    >
      <div className="h-14 flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 font-semibold">F</span>
          <span className="font-semibold tracking-tight">Florea POS</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onLogout}
            className="rounded-xl px-4 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 transition-colors"
          >
            Se déconnecter
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 hover:bg-white/15 transition-colors text-xl"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Toutes les pages</h1>
        <p className="mt-1 text-sm text-white/60">
          Sélectionnez une section. Échap ou ✕ pour revenir.
        </p>

        <div className="mt-8 space-y-10">
          {GROUP_ORDER.map((group) => {
            const items = visible.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <section key={group}>
                <div className="text-[11px] uppercase tracking-widest text-white/50 font-semibold mb-3">
                  {group}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="group rounded-2xl bg-white/5 hover:bg-white/10 transition-colors p-4 flex flex-col items-center text-center aspect-[5/4]"
                    >
                      <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/10 mb-2 group-hover:scale-105 transition-transform">
                        <Icon name={item.icon} size={26} />
                      </span>
                      <span className="text-sm font-medium leading-tight">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
