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
    <div className="fixed inset-0 z-[60] flex flex-col bg-white animate-[fadeIn_120ms_ease-out]">
      <div className="h-14 flex items-center px-4 shrink-0 border-b border-border bg-white">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">F</span>
          <span className="font-semibold tracking-tight text-ink">Webpos</span>
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

      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-8 sm:py-10 bg-white">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">Toutes les pages</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sélectionnez une section. Échap ou ✕ pour revenir.
        </p>

        <div className="mt-6 space-y-6">
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
                      className="group card p-2 flex flex-col items-center justify-center text-center aspect-square hover:shadow-md hover:border-gray-300 transition-all"
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
      </div>
    </div>
  );
}
