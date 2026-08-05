'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SettingsSidebar, { type Item } from './SettingsSidebar';

interface Props {
  items: Item[];
  children: React.ReactNode;
}

/**
 * Master-detail responsive pour les paramètres :
 *  - Desktop (≥ md) : sidebar 260 px + contenu, toujours côte à côte.
 *  - Mobile (< md)  : on affiche soit la liste des sections (si on est
 *                     sur la racine /settings), soit le contenu de la
 *                     section sélectionnée (avec un bouton "← Retour"
 *                     pour revenir à la liste).
 */
export default function SettingsMobileShell({ items, children }: Props) {
  const path = usePathname();
  const isRoot = path === '/settings' || path === '/settings/';
  const active = items.find((i) => path === i.href || path.startsWith(i.href + '/'));

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] md:h-full md:overflow-hidden">
      {/* Sidebar : sur mobile uniquement quand on est sur /settings. */}
      <aside
        className={`${isRoot ? 'flex' : 'hidden md:flex'} flex-col border-r border-border md:overflow-y-auto bg-white`}
      >
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">Section</div>
          <div className="text-lg font-semibold tracking-tight">Paramètres</div>
        </div>
        <SettingsSidebar items={items} />
      </aside>

      {/* Contenu : sur mobile uniquement quand une section est sélectionnée. */}
      <main className={`${isRoot ? 'hidden md:block' : 'block'} md:overflow-y-auto bg-white`}>
        {/* Barre retour mobile uniquement */}
        {!isRoot && (
          <div className="md:hidden sticky top-0 z-10 bg-white border-b border-border px-3 py-2 flex items-center gap-2">
            <Link href="/settings" className="btn-ghost text-sm">← Paramètres</Link>
            {active && (
              <span className="text-sm font-medium text-ink truncate">
                · {active.group === 'ticket' ? 'Ticket · '
                  : active.group === 'labels' ? 'Étiquettes · ' : ''}{active.label}
              </span>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
