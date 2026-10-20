'use client';

import { useState } from 'react';

/**
 * Commentaire d'une vente (ex. numéro de dossier OGF transmis à la
 * commande) — modifiable même après validation : notes n'est pas un champ
 * fiscal gelé (voir fn_protect_validated_sale), seulement les totaux, le
 * numéro de ticket, le hash et la date de validation le sont.
 */
export default function SaleNotesEditor({ saleId, notes, onUpdated }: {
  saleId: string;
  notes: string | null;
  onUpdated: (notes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setValue(notes ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true); setError(null);
    try {
      const r = await fetch(`/api/sales/${saleId}/notes`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: value }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.message ?? j.error ?? 'Erreur.');
        return;
      }
      const j = await r.json();
      onUpdated(j.notes ?? null);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-border p-3">
        <label className="block text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-1.5">
          Commentaire
        </label>
        <textarea
          className="input w-full text-sm min-h-[70px]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex. numéro de dossier, précisions de livraison…"
          autoFocus
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button className="btn-secondary h-8 px-3 text-xs" disabled={saving} onClick={() => setEditing(false)}>
            Annuler
          </button>
          <button className="btn-primary h-8 px-3 text-xs" disabled={saving} onClick={() => void save()}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-1">Commentaire</div>
          {notes ? (
            <p className="text-sm whitespace-pre-line break-words">{notes}</p>
          ) : (
            <p className="text-sm text-ink-soft">Aucun commentaire.</p>
          )}
        </div>
        <button className="btn-soft h-7 px-2.5 text-xs shrink-0" onClick={startEdit}>
          {notes ? 'Modifier' : '+ Ajouter'}
        </button>
      </div>
    </div>
  );
}
