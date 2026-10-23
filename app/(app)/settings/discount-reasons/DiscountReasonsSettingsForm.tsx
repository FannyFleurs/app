'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { confirmThemed } from '@/lib/ui/dialog';
import type { DiscountReason, DiscountReasonsSettings } from '@/lib/settings/discount-reasons';

export default function DiscountReasonsSettingsForm({ initial, canWrite }: {
  initial: DiscountReasonsSettings;
  canWrite: boolean;
}) {
  const [reasons, setReasons] = useState(initial.reasons);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(next: DiscountReason[]) {
    const previous = reasons;
    setReasons(next); // optimiste : la case/le retrait se reflète sans attendre la réponse.
    setSaving(true); setErr(null); setMsg(null);
    const r = await fetch('/api/settings/discount-reasons', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasons: next }),
    });
    setSaving(false);
    if (r.ok) {
      const j = await r.json();
      setReasons(j.settings.reasons);
      setMsg('Réglages enregistrés.');
    } else {
      setReasons(previous);
      setErr('Enregistrement impossible.');
    }
  }

  function addReason() {
    const label = newReason.trim();
    if (!label || reasons.some((r) => r.label === label)) { setNewReason(''); return; }
    setNewReason('');
    void save([...reasons, { label, justification_required: false }]);
  }

  async function removeReason(label: string) {
    if (!(await confirmThemed({ message: `Supprimer le motif « ${label} » ?` }))) return;
    void save(reasons.filter((r) => r.label !== label));
  }

  function toggleRequired(label: string, value: boolean) {
    void save(reasons.map((r) => (r.label === label ? { ...r, justification_required: value } : r)));
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-2xl">
      <PageHeader
        title="Motifs de remise"
        subtitle="Les motifs proposés en caisse lors d'une remise manuelle (sur une ligne ou sur le panier), propres à votre organisation."
        actions={null}
      />

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Motifs proposés</h3>
        <p className="text-sm text-ink-soft">
          Pour chaque motif, la case « Justification obligatoire » impose au vendeur de taper une
          explication en plus du motif choisi ; décochée, cliquer sur le motif suffit. Un motif
          tapé librement (hors de cette liste) reste obligatoire par défaut.
        </p>
        <div className="space-y-1.5">
          {reasons.map((r) => (
            <div key={r.label} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2">
              <span className="font-medium flex-1">{r.label}</span>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  checked={r.justification_required}
                  disabled={!canWrite || saving}
                  onChange={(e) => toggleRequired(r.label, e.target.checked)}
                />
                Justification obligatoire
              </label>
              {canWrite && (
                <button className="btn-ghost text-xs text-danger" onClick={() => void removeReason(r.label)}>
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
