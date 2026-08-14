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
            Plafond d&apos;espèces, fonds de caisse minimum, prélèvements — par boutique.
          </p>
        </div>
        <StoreScopeSelect stores={stores} value={storeId} onChange={setStoreId} lockedStoreId={lockedStoreId} />
      </div>

      {/* Le mode de fonds de caisse change la façon dont la journée s'ouvre et
          se ferme sur les postes : il mérite son propre bloc, en tête. */}
      <div className="card p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Fonds de caisse de la boutique</h2>
          <p className="text-sm text-ink-soft mt-0.5">
            Détermine si chaque caisse gère son propre fonds, ou si la boutique
            n&apos;en a qu&apos;un seul pour tous les postes.
          </p>
        </div>

        <ModeChoice
          value={form.shared_float}
          disabled={!canEdit}
          onChange={(v) => setForm({ ...form, shared_float: v })}
        />
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
          label="Fonds de caisse minimum après prélèvement (€)"
          help="Montant à laisser obligatoirement dans le tiroir lors d'un prélèvement."
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
            label="Autoriser les prélèvements pendant la journée"
            checked={form.allow_bank_deposit}
            disabled={!canEdit}
            onChange={(v) => setForm({ ...form, allow_bank_deposit: v })}
          />
          <Check
            label="Exiger au moins un prélèvement par jour"
            checked={form.bank_deposit_required}
            disabled={!canEdit || !form.allow_bank_deposit}
            onChange={(v) => setForm({ ...form, bank_deposit_required: v })}
          />
          <Check
            label="Imprimer un reçu à chaque prélèvement"
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

/**
 * Choix du mode de fonds de caisse. Deux cartes plutôt que deux cases : la
 * conséquence sur l'ouverture et la fermeture de la journée doit être lisible
 * avant de cliquer, pas après.
 */
function ModeChoice({ value, disabled, onChange }: {
  value: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  const options = [
    {
      shared: true,
      title: 'Un fonds commun à la boutique (par défaut)',
      lines: [
        'La première caisse ouverte déclare le fonds pour toute la boutique.',
        'Les autres postes n\'ont rien à ouvrir : ils encaissent directement.',
        'La première fermeture referme la caisse sur tous les postes.',
      ],
    },
    {
      shared: false,
      title: 'Un fonds par caisse (poste)',
      lines: [
        'Chaque caisse ouvre la journée avec son propre fonds.',
        'Chaque caisse compte et ferme la sienne.',
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((o) => {
        const active = o.shared === value;
        return (
          <button
            key={String(o.shared)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.shared)}
            className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
              active ? 'bg-primary-soft/40' : 'border-border hover:bg-gray-50'
            }`}
            style={active ? { borderColor: 'var(--primary)' } : undefined}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                style={{ borderColor: active ? 'var(--primary)' : 'var(--border)' }}
              >
                {active && (
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                )}
              </span>
              <span className="font-semibold">{o.title}</span>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {o.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </button>
        );
      })}
    </div>
  );
}
