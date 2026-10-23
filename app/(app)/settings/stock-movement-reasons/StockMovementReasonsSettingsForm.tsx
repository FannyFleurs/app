'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { confirmThemed } from '@/lib/ui/dialog';
import type { StockMovementReasonsSettings } from '@/lib/settings/stock-movement-reasons';

export default function StockMovementReasonsSettingsForm({ initial, canWrite }: {
  initial: StockMovementReasonsSettings;
  canWrite: boolean;
}) {
  const [reasons, setReasons] = useState(initial.reasons);
  const [required, setRequired] = useState(initial.justification_required);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: Partial<StockMovementReasonsSettings>) {
    setSaving(true); setErr(null); setMsg(null);
    const r = await fetch('/api/settings/stock-movement-reasons', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json();
      setReasons(j.settings.reasons);
      setRequired(j.settings.justification_required);
      setMsg('Réglages enregistrés.');
    } else {
      setErr('Enregistrement impossible.');
    }
  }

  function addReason() {
    const label = newReason.trim();
    if (!label || reasons.includes(label)) { setNewReason(''); return; }
    setNewReason('');
    void save({ reasons: [...reasons, label] });
  }

  async function removeReason(label: string) {
    if (!(await confirmThemed({ message: `Supprimer le motif « ${label} » ?` }))) return;
    void save({ reasons: reasons.filter((r) => r !== label) });
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-2xl">
      <PageHeader
        title="Motifs de mouvement de stock"
        subtitle="Les motifs proposés pour une entrée ou une sortie de stock manuelle, propres à votre organisation."
        actions={null}
      />

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      <div className="card p-5 space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={required}
            disabled={!canWrite || saving}
            onChange={(e) => void save({ justification_required: e.target.checked })}
          />
          Justification obligatoire pour une sortie de stock
        </label>
        <p className="text-sm text-ink-soft">
          Une entrée de stock garde toujours un motif facultatif. Si décoché, le motif devient
          facultatif même pour une sortie.
        </p>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Motifs proposés</h3>
        <div className="space-y-1.5">
          {reasons.map((r) => (
            <div key={r} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="font-medium flex-1">{r}</span>
              {canWrite && (
                <button className="btn-ghost text-xs text-danger" onClick={() => void removeReason(r)}>
                  Supprimer
                </button>
              )}
            </div>
          ))}
          {reasons.length === 0 && <p className="text-sm text-ink-soft">Aucun motif proposé pour l&apos;instant.</p>}
        </div>
        {canWrite && (
          <div className="flex gap-2 pt-2">
            <input
              className="input flex-1"
              placeholder="Nouveau motif"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addReason(); }}
              maxLength={80}
            />
            <button className="btn-soft text-sm h-11 px-4" disabled={saving || !newReason.trim()} onClick={addReason}>
              Ajouter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
