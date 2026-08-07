'use client';

import { useState } from 'react';
import { CORE_FORMAT, OPTIONAL_FORMATS } from '@/lib/settings/export-formats';

export default function ExportFormatsForm({ initial, canEdit }: {
  initial: string[];
  canEdit: boolean;
}) {
  const [on, setOn] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setOn((cur) => cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
    setSaved(false);
  }

  async function submit() {
    setSaving(true); setError(null);
    const r = await fetch('/api/settings/export-formats', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optional: on }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Enregistrement impossible.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Formats d&apos;export</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Ce que propose l&apos;écran « Exports comptables ». Un seul format sert au
          quotidien ; les autres restent disponibles à la demande.
        </p>
      </div>

      {/* Le format de base est montré, non décochable : son absence de case
          dit mieux qu'une case grisée qu'il n'y a rien à décider ici. */}
      <div className="card p-4">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold">{CORE_FORMAT.label}</h2>
          <span className="text-[11px] uppercase tracking-widest text-ink-soft">Toujours proposé</span>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{CORE_FORMAT.description}</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Formats supplémentaires
        </h2>
        {OPTIONAL_FORMATS.map((f) => (
          <label key={f.value}
                 className={`card p-4 flex gap-3 items-start ${canEdit ? 'cursor-pointer' : ''}`}>
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--primary)]"
                   checked={on.includes(f.value)} disabled={!canEdit}
                   onChange={() => toggle(f.value)} />
            <div className="min-w-0">
              <div className="font-medium">{f.label}</div>
              <p className="mt-0.5 text-sm text-ink-soft">{f.description}</p>
              {/* La réserve est dite ici, avant de cocher — pas découverte
                  dans le fichier une fois qu'il est parti chez le comptable. */}
              {f.caveat && (
                <p className="mt-1 text-sm text-warning">À savoir : {f.caveat}</p>
              )}
            </div>
          </label>
        ))}
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Enregistré</div>}

      {canEdit && (
        <button className="btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
