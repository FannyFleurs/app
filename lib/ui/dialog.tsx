'use client';

import { useEffect, useReducer, useState } from 'react';

/**
 * Boîtes de dialogue AU THÈME (remplacent confirm/alert/prompt natifs).
 *
 * API impérative asynchrone :
 *   if (await confirmThemed({ message, danger: true })) { ... }
 *   await alertThemed({ message });
 *   const v = await promptThemed({ message, defaultValue });
 *
 * Un unique <DialogHost/> monté à la racine affiche la file d'attente.
 */

type Kind = 'confirm' | 'alert' | 'prompt';
interface DialogReq {
  id: number;
  kind: Kind;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: boolean | string | null) => void;
}

let seq = 0;
const queue: DialogReq[] = [];
const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => l()); }

function push(req: Omit<DialogReq, 'id'>) {
  queue.push({ ...req, id: ++seq });
  emit();
}
function resolveCurrent(value: boolean | string | null) {
  const r = queue.shift();
  emit();
  r?.resolve(value);
}

export function confirmThemed(opts: {
  message: string; title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => push({ kind: 'confirm', ...opts, resolve: (v) => resolve(v === true) }));
}
export function alertThemed(opts: { message: string; title?: string; confirmLabel?: string }): Promise<void> {
  return new Promise((resolve) => push({ kind: 'alert', ...opts, resolve: () => resolve() }));
}
export function promptThemed(opts: {
  message: string; title?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string; cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => push({ kind: 'prompt', ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }));
}

export default function DialogHost() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const l = () => force();
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  const d = queue[0];
  const [val, setVal] = useState('');
  useEffect(() => { setVal(d?.kind === 'prompt' ? (d.defaultValue ?? '') : ''); }, [d?.id, d?.kind, d?.defaultValue]);

  if (!d) return null;

  const cancel = () => resolveCurrent(d.kind === 'prompt' ? null : false);
  const ok = () => resolveCurrent(d.kind === 'prompt' ? val : true);

  return (
    <div
      className="fixed inset-0 z-[300] grid place-items-center bg-ink/40 backdrop-blur-sm p-4"
      onClick={() => { if (d.kind !== 'prompt') cancel(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') cancel();
        else if (e.key === 'Enter' && d.kind !== 'prompt') ok();
      }}
    >
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        {d.title && <h2 className="text-base font-semibold mb-1">{d.title}</h2>}
        <p className="text-sm text-ink whitespace-pre-line">{d.message}</p>

        {d.kind === 'prompt' && (
          <input
            className="input h-11 w-full mt-3"
            autoFocus
            value={val}
            placeholder={d.placeholder}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') ok(); }}
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          {d.kind !== 'alert' && (
            <button onClick={cancel} className="btn-ghost min-h-[44px] px-4">
              {d.cancelLabel ?? 'Annuler'}
            </button>
          )}
          <button
            onClick={ok}
            autoFocus={d.kind !== 'prompt'}
            className={`min-h-[44px] px-4 rounded-xl font-medium text-white ${d.danger ? 'bg-danger hover:opacity-90' : 'btn-primary'}`}
          >
            {d.confirmLabel ?? (d.kind === 'alert' ? 'OK' : d.kind === 'prompt' ? 'Valider' : 'Confirmer')}
          </button>
        </div>
      </div>
    </div>
  );
}
