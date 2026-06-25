'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SIDEBAR_ITEMS } from '@/components/Sidebar';
import type { Role } from '@/lib/auth/rbac';
import { hasPermission } from '@/lib/auth/rbac';
import Icon from '@/components/Icon';

interface Props {
  initialHiddenPaths: string[];
  canWrite: boolean;
  role: Role;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AccessForm({ initialHiddenPaths, canWrite, role }: Props) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHiddenPaths));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!canWrite) return;
    if (firstRender.current) { firstRender.current = false; return; }
    const t = setTimeout(async () => {
      setSaveState('saving');
      setError(null);
      const res = await fetch('/api/settings/pos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden_sidebar_paths: Array.from(hidden) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.message ?? j.error ?? 'Erreur');
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      router.refresh();
      setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1200);
    }, 400);
    return () => clearTimeout(t);
  }, [hidden, canWrite, router]);

  function toggle(path: string) {
    if (!canWrite) return;
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  // Regroupe par section
  const groups: Record<string, typeof SIDEBAR_ITEMS> = {};
  for (const i of SIDEBAR_ITEMS) {
    if (i.perm && !hasPermission(role, i.perm)) continue;
    (groups[i.group] ??= []).push(i);
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-soft min-h-[1.25rem]">
        {saveState === 'saving' && 'Enregistrement…'}
        {saveState === 'saved' && <span className="text-success">✓ Enregistré</span>}
        {saveState === 'error' && <span className="text-danger">⚠ {error}</span>}
        {saveState === 'idle' && canWrite && 'Modifications enregistrées automatiquement.'}
      </div>

      {Object.entries(groups).map(([group, items]) => (
        <section key={group} className="card p-5">
          <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider text-ink-soft">{group}</h3>
          <ul className="divide-y divide-border">
            {items.map((i) => {
              const isHidden = hidden.has(i.href);
              return (
                <li key={i.href} className="flex items-center gap-3 py-2.5">
                  <span className="text-accent-deep">
                    <Icon name={i.icon} size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{i.label}</div>
                    <div className="text-xs text-ink-soft font-mono">{i.href}</div>
                  </div>
                  {i.required ? (
                    <span className="text-xs text-ink-soft">Toujours visible</span>
                  ) : (
                    <button
                      onClick={() => toggle(i.href)}
                      disabled={!canWrite}
                      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                        !isHidden ? 'bg-sage' : 'bg-border'
                      } ${!canWrite ? 'opacity-50 cursor-not-allowed' : ''}`}
                      aria-pressed={!isHidden}
                      aria-label={isHidden ? 'Activer' : 'Désactiver'}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                          !isHidden ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
