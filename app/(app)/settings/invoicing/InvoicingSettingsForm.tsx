'use client';

import { useEffect, useState } from 'react';
import { mergeInvoiceDefaults, type InvoiceSettings } from '@/lib/settings/invoice';
import { PAYMENT_TERMS } from '@/lib/settings/payment-terms';

export default function InvoicingSettingsForm({ stores, canEdit, lockedStoreId }: {
  stores: { id: string; name: string }[]; canEdit: boolean;
  lockedStoreId?: string | null;
}) {
  const [storeId, setStoreId] = useState<string>(lockedStoreId ?? stores[0]?.id ?? '');
  const [form, setForm] = useState<InvoiceSettings>(mergeInvoiceDefaults(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSaved(false);
    void (async () => {
      const r = await fetch(`/api/settings/invoicing?store_id=${encodeURIComponent(storeId)}`);
      if (cancelled) return;
      if (r.ok) setForm((await r.json()).settings as InvoiceSettings);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  function patch<K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/invoicing', {
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
    <div className="p-6 md:p-8 max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturation</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Coordonnées bancaires (RIB) et conditions de règlement par défaut —{' '}
            <strong>propre à chaque boutique</strong>.
          </p>
        </div>
        {!lockedStoreId && stores.length > 0 && (
          <label className="text-sm">
            <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
            <select
              className="input h-10 min-w-[12rem]"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {stores.length === 0 && (
        <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
          Aucune boutique accessible : impossible de paramétrer la facturation.
        </div>
      )}

      {loading ? (
        <div className="card p-6 text-sm text-ink-soft">Chargement…</div>
      ) : (
        <>
          <div className="card p-5 space-y-4">
            <div>
              <h2 className="font-semibold">Conditions de règlement par défaut</h2>
              <p className="text-xs text-ink-soft mt-1">
                Appliquées à une nouvelle facture si le client n&apos;a pas ses propres
                conditions. Modifiable par client sur sa fiche.
              </p>
            </div>
            <label className="block text-sm">
              <span className="text-ink-soft">Condition par défaut</span>
              <select
                className="input mt-1 max-w-xs" disabled={!canEdit}
                value={form.default_payment_terms}
                onChange={(e) => patch('default_payment_terms', e.target.value)}
              >
                {PAYMENT_TERMS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Coordonnées bancaires (RIB)</h2>
                <p className="text-xs text-ink-soft mt-1">
                  Affichées sur la facture pour permettre au client de régler par virement.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input
                  type="checkbox" disabled={!canEdit}
                  checked={form.show_bank_details}
                  onChange={(e) => patch('show_bank_details', e.target.checked)}
                />
                Afficher sur la facture
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-ink-soft">Titulaire du compte</span>
                <input className="input mt-1" disabled={!canEdit}
                       value={form.bank_holder}
                       onChange={(e) => patch('bank_holder', e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-soft">Banque</span>
                <input className="input mt-1" disabled={!canEdit}
                       value={form.bank_name}
                       onChange={(e) => patch('bank_name', e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="text-ink-soft">IBAN</span>
                <input className="input mt-1 font-mono" disabled={!canEdit}
                       value={form.bank_iban}
                       onChange={(e) => patch('bank_iban', e.target.value.toUpperCase())}
                       placeholder="FR76 …" />
              </label>
              <label className="block text-sm">
                <span className="text-ink-soft">BIC</span>
                <input className="input mt-1 font-mono" disabled={!canEdit}
                       value={form.bank_bic}
                       onChange={(e) => patch('bank_bic', e.target.value.toUpperCase())} />
              </label>
            </div>
          </div>

          {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Enregistré</div>}

          {canEdit && (
            <button onClick={() => void submit()} disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
