'use client';

import { useEffect, useState } from 'react';

interface PaymentMethod {
  id: string;
  code: string;
  kind: string;
  label: string;
  is_active: boolean;
  position: number;
  store_ids: string[];
}

interface StripeData {
  enabled: boolean;
  publishable_key: string;
  secret_key_masked: string;
  secret_key_set: boolean;
  webhook_secret_masked: string;
  webhook_secret_set: boolean;
  return_url: string;
}

const PM_KIND_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'transfer', label: 'Virement' },
  { value: 'gift_card', label: 'Carte cadeau' },
  { value: 'credit_note', label: 'Avoir' },
  { value: 'payment_link', label: 'Lien de paiement Stripe' },
  { value: 'deferred', label: 'Différé client' },
  { value: 'other', label: 'Autre' },
];

export default function PaymentMethodsForm({ canWrite, stores }: {
  canWrite: boolean; stores: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState('other');
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const multiStore = stores.length > 1;

  async function load() {
    setLoading(true);
    const r = await fetch('/api/payment-methods');
    if (r.ok) {
      const methods = (await r.json()).methods as PaymentMethod[];
      setItems(methods.map((m) => ({ ...m, store_ids: m.store_ids ?? [] })));
    }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(id: string, is_active: boolean) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    void load();
  }
  async function rename(id: string, label: string) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    void load();
  }
  // Bascule l'appartenance d'un mode à une boutique. store_ids vide = toutes.
  async function toggleStore(m: PaymentMethod, storeId: string) {
    const next = m.store_ids.includes(storeId)
      ? m.store_ids.filter((s) => s !== storeId)
      : [...m.store_ids, storeId];
    // Optimiste : reflète tout de suite l'état dans la liste.
    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, store_ids: next } : x)));
    await fetch(`/api/payment-methods/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_ids: next }),
    });
  }
  // « Toutes les boutiques » = store_ids vide.
  async function setAllStores(m: PaymentMethod) {
    if (m.store_ids.length === 0) return;
    setItems((cur) => cur.map((x) => (x.id === m.id ? { ...x, store_ids: [] } : x)));
    await fetch(`/api/payment-methods/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_ids: [] }),
    });
  }
  async function add() {
    if (!newLabel.trim()) return;
    setAddError(null);
    setSaving(true);
    try {
      const r = await fetch('/api/payment-methods', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim(), kind: newKind }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setAddError(j.message ?? j.error ?? `Erreur (${r.status})`);
        return;
      }
      setNewLabel('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Un mode payment_link est-il present et actif ?
  const stripeMethod = items.find((m) => m.kind === 'payment_link');
  const stripeEnabled = !!stripeMethod?.is_active;

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Modes de règlement</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Activer / désactiver et renommer les moyens de paiement disponibles en caisse.
          {multiStore && ' Limitez un mode à certaines boutiques si besoin (ex. TPE).'}
        </p>
      </div>

      <div className="card p-5 space-y-3">
        {loading ? (
          <p className="text-sm text-ink-soft">Chargement…</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((m) => (
              <li key={m.id} className="rounded-xl border border-border p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider w-20 text-ink-soft">{m.kind}</span>
                  <input
                    className="input h-9 flex-1"
                    defaultValue={m.label}
                    disabled={!canWrite}
                    onBlur={(e) => e.target.value !== m.label && void rename(m.id, e.target.value)}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox" checked={m.is_active}
                      disabled={!canWrite}
                      onChange={(e) => void toggle(m.id, e.target.checked)}
                    />
                    Actif
                  </label>
                </div>
                {multiStore && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-[calc(5rem+0.5rem)]">
                    <span className="text-[11px] text-ink-soft mr-0.5">Boutiques :</span>
                    <button
                      type="button"
                      disabled={!canWrite}
                      onClick={() => void setAllStores(m)}
                      className={`rounded-full px-2 py-0.5 text-[11px] border transition-colors ${
                        m.store_ids.length === 0
                          ? 'accent-bar text-white border-transparent'
                          : 'bg-white border-border text-ink-soft hover:bg-gray-50'
                      }`}
                    >
                      Toutes
                    </button>
                    {stores.map((st) => {
                      const on = m.store_ids.includes(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          disabled={!canWrite}
                          onClick={() => void toggleStore(m, st.id)}
                          className={`rounded-full px-2 py-0.5 text-[11px] border transition-colors ${
                            on
                              ? 'accent-bar text-white border-transparent'
                              : 'bg-white border-border text-ink hover:bg-gray-50'
                          }`}
                        >
                          {st.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                className="input h-9 flex-1" placeholder="Nouveau libellé"
                value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
              />
              <select
                className="input h-9 max-w-[160px]" value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              >
                {PM_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <button
                className="btn-soft text-sm"
                onClick={() => void add()}
                disabled={!newLabel.trim() || saving}
              >
                {saving ? '…' : '+ Ajouter'}
              </button>
            </div>
            {addError && (
              <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {addError}
              </div>
            )}
          </div>
        )}
      </div>

      {stripeEnabled && <StripeConfig canWrite={canWrite} />}
    </div>
  );
}

/**
 * Configuration Stripe inline, affichee uniquement si un mode
 * "payment_link" est actif dans la liste ci-dessus. Contient les
 * cles API + secret webhook + URL de retour.
 */
function StripeConfig({ canWrite }: { canWrite: boolean }) {
  const [data, setData] = useState<StripeData | null>(null);
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [whs, setWhs] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const r = await fetch('/api/settings/stripe');
    if (r.ok) {
      const j = await r.json();
      setData(j.settings);
      setPk(j.settings.publishable_key);
      setReturnUrl(j.settings.return_url);
    }
  }
  useEffect(() => { void reload(); }, []);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/stripe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: true,
        publishable_key: pk.trim(),
        secret_key: sk.trim() || undefined,
        webhook_secret: whs.trim() || undefined,
        return_url: returnUrl.trim(),
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    setSk(''); setWhs('');
    setTimeout(() => setSaved(false), 2500);
    void reload();
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Configuration Stripe</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Cles API + secret webhook necessaires pour generer les liens
          de paiement Stripe utilises par le mode « Lien de paiement »
          ci-dessus.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-ink-soft">Clé publique (pk_live_ / pk_test_)</label>
        <input
          className="input mt-1 font-mono text-sm"
          value={pk} onChange={(e) => setPk(e.target.value)}
          disabled={!canWrite}
          placeholder="pk_test_xxxxxxxxxxxx"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-ink-soft">Clé secrète (sk_live_ / sk_test_)</label>
        {data?.secret_key_set && !sk && (
          <div className="mt-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono">
            {data.secret_key_masked}
            <span className="ml-2 text-xs text-ink-soft">(saisie pour remplacer)</span>
          </div>
        )}
        <input
          type="password"
          className={`input ${data?.secret_key_set ? 'mt-2' : 'mt-1'} font-mono text-sm`}
          value={sk} onChange={(e) => setSk(e.target.value)}
          disabled={!canWrite}
          placeholder={data?.secret_key_set ? 'Laisser vide pour conserver' : 'sk_test_xxxxxxxxxxxx'}
        />
        <p className="mt-1 text-xs text-ink-soft">
          Stockée chiffrée en base. Jamais réaffichée en clair.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-ink-soft">Webhook signing secret (whsec_…)</label>
        {data?.webhook_secret_set && !whs && (
          <div className="mt-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono">
            {data.webhook_secret_masked}
          </div>
        )}
        <input
          type="password"
          className={`input ${data?.webhook_secret_set ? 'mt-2' : 'mt-1'} font-mono text-sm`}
          value={whs} onChange={(e) => setWhs(e.target.value)}
          disabled={!canWrite}
          placeholder={data?.webhook_secret_set ? 'Laisser vide pour conserver' : 'whsec_xxxxxxxxxxxx'}
        />
        <p className="mt-1 text-xs text-ink-soft">
          URL webhook à configurer dans Stripe : <code className="bg-gray-100 px-1 rounded">https://VOTRE-DOMAINE/api/webhooks/stripe</code>
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-ink-soft">URL de retour après paiement (optionnel)</label>
        <input
          className="input mt-1 text-sm"
          value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)}
          disabled={!canWrite}
          placeholder="https://votre-site.fr/merci"
        />
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canWrite && (
        <button onClick={() => void submit()} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer Stripe'}
        </button>
      )}
    </div>
  );
}
