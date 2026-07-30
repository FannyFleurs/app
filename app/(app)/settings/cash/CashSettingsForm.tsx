'use client';

import { useEffect, useState } from 'react';
import { CASH_DEFAULTS, type CashSettings } from '@/lib/settings/cash';
import StoreScopeSelect from '@/components/StoreScopeSelect';

export default function CashSettingsForm({ canEdit, stores, lockedStoreId }: {
  canEdit: boolean; stores: { id: string; name: string }[];
  lockedStoreId?: string | null;
}) {
  const [storeId, setStoreId] = useState<string>(lockedStoreId ?? stores[0]?.id ?? '');
  const [form, setForm] = useState<CashSettings>(CASH_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Recharge la gestion argent de la boutique sélectionnée (repli org).
  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSaved(false);
    void (async () => {
      const r = await fetch(`/api/settings/cash?store_id=${encodeURIComponent(storeId)}`);
      if (cancelled) return;
      if (r.ok) setForm((await r.json()).settings as CashSettings);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/cash', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, store_id: storeId || undefined }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestion argent</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Plafond d&apos;espèces, fonds de caisse minimum, remises en banque — par boutique.
          </p>
        </div>
        <StoreScopeSelect stores={stores} value={storeId} onChange={setStoreId} lockedStoreId={lockedStoreId} />
      </div>

      <div className="card p-5 space-y-4">
        <Field
          label="Plafond d'espèces en caisse (€)"
          help="Alerte au-delà. Mettre 0 pour désactiver."
        >
          <input
            type="number" step="10" min={0}
            className="input"
            value={form.cash_cap}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, cash_cap: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Seuil paiement espèces (€)"
          help="Demande confirmation au-dessus (anti-saisie d'erreur). 0 = jamais."
        >
          <input
            type="number" step="50" min={0}
            className="input"
            value={form.large_cash_threshold}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, large_cash_threshold: Number(e.target.value) })}
          />
        </Field>

        <Field
          label="Fonds de caisse minimum après remise (€)"
          help="Montant à laisser obligatoirement dans le tiroir lors d'une remise en banque."
        >
          <input
            type="number" step="10" min={0}
            className="input"
            value={form.minimum_float}
            disabled={!canEdit}
            onChange={(e) => setForm({ ...form, minimum_float: Number(e.target.value) })}
          />
        </Field>

        <div className="space-y-2 pt-2 border-t border-border">
          <Check
            label="Autoriser les remises en banque pendant la journée"
            checked={form.allow_bank_deposit}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, allow_bank_deposit: v })}
          />
          <Check
            label="Exiger au moins une remise en banque par jour"
            checked={form.bank_deposit_required}
            disabled={!canEdit || !form.allow_bank_deposit}
            onChange={(v) => setForm({ ...form, bank_deposit_required: v })}
          />
          <Check
            label="Imprimer un reçu à chaque remise en banque"
            checked={form.print_bank_deposit_receipt}
            disabled={!canEdit || !form.allow_bank_deposit}
            onChange={(v) => setForm({ ...form, print_bank_deposit_receipt: v })}
          />
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canEdit && (
        <button onClick={() => void submit()} disabled={saving || loading || !storeId} className="btn-primary">
          {loading ? 'Chargement…' : saving ? 'Enregistrement…' : 'Enregistrer cette boutique'}
        </button>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
      {help && <p className="mt-1 text-xs text-ink-soft">{help}</p>}
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>{label}</span>
    </label>
  );
}
