'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from '@/components/Icon';

export type SettingsGroup = 'ticket' | 'labels';

export interface Item {
  href: string;
  label: string;
  icon: IconName;
  /** Réglages réunis dans un même dossier (imprimante + paramétrage). */
  group?: SettingsGroup;
}

/** Intitulé et icône de chaque dossier. */
const GROUPS: Record<SettingsGroup, { label: string; icon: IconName }> = {
  ticket: { label: 'Ticket', icon: 'print' },
  labels: { label: 'Étiquettes', icon: 'products' },
};

export default function SettingsSidebar({ items }: { items: Item[] }) {
  const path = usePathname();
  const isActive = (href: string) => path === href || path.startsWith(href + '/');

  // Une entrée par dossier, insérée à la position de son premier réglage :
  // l'ordre général du menu reste celui défini par la page.
  const rendered = new Set<SettingsGroup>();

  return (
    <nav className="p-2 space-y-0.5">
      {items.map((item) => {
        if (!item.group) return <Row key={item.href} item={item} active={isActive(item.href)} />;

        if (rendered.has(item.group)) return null;
        rendered.add(item.group);

        const members = items.filter((i) => i.group === item.group);
        return (
          <Folder
            key={item.group}
            group={item.group}
            members={members}
            isActive={isActive}
          />
        );
      })}
    </nav>
  );
}

/** Réglage isolé. */
function Row({ item, active, nested = false }: {
  item: Item;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors ${
        nested ? 'pl-9 pr-3' : 'px-3'
      } ${active ? 'bg-accent-soft text-accent-deep' : 'text-ink-soft hover:bg-gray-50 hover:text-ink'}`}
    >
      {!nested && <span className="text-accent-deep"><Icon name={item.icon} size={20} /></span>}
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Dossier de réglages : replié par défaut, il s'ouvre au toucher — et
 * automatiquement quand on se trouve déjà sur l'un de ses réglages, pour que
 * l'écran courant soit toujours situable dans le menu.
 */
function Folder({ group, members, isActive }: {
  group: SettingsGroup;
  members: Item[];
  isActive: (href: string) => boolean;
}) {
  const containsActive = members.some((m) => isActive(m.href));
  const [open, setOpen] = useState(containsActive);
  const expanded = open || containsActive;
  const meta = GROUPS[group];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
          containsActive ? 'text-accent-deep' : 'text-ink-soft hover:bg-gray-50 hover:text-ink'
        }`}
      >
        <span className="text-accent-deep"><Icon name={meta.icon} size={20} /></span>
        <span className="flex-1 text-left truncate">{meta.label}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" aria-hidden
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {expanded && (
        <div className="space-y-0.5">
          {members.map((m) => (
            <Row key={m.href} item={m} active={isActive(m.href)} nested />
          ))}
        </div>
      )}
    </div>
  );
}
