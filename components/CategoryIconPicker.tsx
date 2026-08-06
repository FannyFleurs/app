'use client';

import { useMemo, useState } from 'react';
import CategoryIcon, {
  CATEGORY_ICONS, CATEGORY_ICON_GROUPS, categoryIconDef,
} from '@/lib/category-icons';

/**
 * Choix de l'icône d'une catégorie.
 *
 * Plus de cent dessins : les parcourir à l'œil devient vite pénible, d'où la
 * recherche en tête — elle interroge le libellé ET les mots-clés, pour qu'on
 * trouve « Boucherie » en tapant « viande ». Sans recherche, les rayons
 * restent groupés par métier : c'est ainsi qu'on découvre ce qui existe.
 */
export default function CategoryIconPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const groups = useMemo(() => {
    const matches = CATEGORY_ICONS.filter((i) => !needle
      || i.label.toLowerCase().includes(needle)
      || i.key.includes(needle)
      || (i.tags?.includes(needle) ?? false)
      || i.group.toLowerCase().includes(needle));
    return CATEGORY_ICON_GROUPS
      .map((g) => ({ group: g, items: matches.filter((i) => i.group === g) }))
      .filter((g) => g.items.length > 0);
  }, [needle]);

  // Une catégorie peut porter une clé héritée, redirigée vers un autre dessin.
  // C'est ce dessin-là qu'il faut montrer comme sélectionné, sinon le libellé
  // annonce une icône que rien ne surligne dans la grille.
  const current = categoryIconDef(value);
  const activeKey = current?.key ?? null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          className="input h-10 flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une icône (fleur, pain, vin, chien…)"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`h-10 shrink-0 rounded-xl border px-3 text-sm transition-colors ${
            value === null
              ? 'border-accent bg-accent-soft text-accent-deep font-medium'
              : 'border-border bg-surface text-ink-soft hover:text-ink'
          }`}
        >
          Aucune
        </button>
      </div>

      {current && (
        <div className="mt-2 text-xs text-ink-soft">
          Icône choisie : <span className="font-medium text-ink">{current.label}</span>
        </div>
      )}

      <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border p-2 space-y-3">
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-ink-soft">Aucune icône ne correspond.</p>
        )}
        {groups.map(({ group, items }) => (
          <div key={group}>
            <div className="px-1 pb-1 text-[10px] uppercase tracking-widest text-ink-soft font-semibold">
              {group}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((i) => {
                const active = i.key === activeKey;
                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => onChange(i.key)}
                    title={i.label}
                    aria-label={i.label}
                    aria-pressed={active}
                    className={`grid h-11 w-11 place-items-center rounded-xl border transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft text-accent-deep'
                        : 'border-border bg-surface text-ink-soft hover:border-gray-300 hover:text-ink'
                    }`}
                  >
                    <CategoryIcon name={i.key} size={24} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
