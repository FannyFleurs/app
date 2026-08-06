'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SettingsSidebar, { type Item } from './SettingsSidebar';

interface Props {
  items: Item[];
  /** Adresse du back-office, ou null si l'on y est déjà. */
  boUrl?: string | null;
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
export default function SettingsMobileShell({ items, boUrl, children }: Props) {
  const path = usePathname();
  const isRoot = path === '/settings' || path === '/settings/';
  const active = items.find((i) => path === i.href || path.startsWith(i.href + '/'));

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden">
      {/* Accès au back-office : depuis la caisse, les réglages sont l'endroit
          d'où l'on bascule naturellement vers la gestion. */}
      {boUrl && (
        <div className="shrink-0 flex items-center justify-end gap-2 border-b border-border bg-surface px-3 py-2">
          <a
            href={boUrl}
            className="btn-soft h-9 px-3 text-sm inline-flex items-center gap-2"
            title="Ouvrir le back-office"
          >
            Accéder au BO
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 4h6v6" /><path d="M20 4 10 14" />
              <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        </div>
      )}

    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] md:flex-1 md:min-h-0 md:overflow-hidden">
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
    </div>
  );
}
