'use client';

import { useEffect, useState } from 'react';

interface Data {
  enabled: boolean;
  publishable_key: string;
  secret_key_masked: string;
  secret_key_set: boolean;
  webhook_secret_masked: string;
  webhook_secret_set: boolean;
  return_url: string;
}

export default function StripeSettingsForm({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [whs, setWhs] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/settings/stripe');
      if (r.ok) {
        const j = await r.json();
        setData(j.settings);
        setEnabled(j.settings.enabled);
        setPk(j.settings.publishable_key);
        setReturnUrl(j.settings.return_url);
      }
    })();
  }, []);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/stripe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
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
    // Recharge
    const refresh = await fetch('/api/settings/stripe');
    if (refresh.ok) setData((await refresh.json()).settings);
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stripe — Paiement en ligne</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Configurez votre compte Stripe pour envoyer des liens de paiement
          aux clients (commandes différées : retrait à date ou livraison).
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <span className="text-sm font-medium">Paiement Stripe activé</span>
          <input
            type="checkbox" className="h-5 w-5"
            checked={enabled} disabled={!canEdit}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </label>

        <div>
          <label className="text-sm font-medium text-ink-soft">Clé publique (pk_live_ / pk_test_)</label>
          <input
            className="input mt-1 font-mono text-sm"
            value={pk} onChange={(e) => setPk(e.target.value)}
            disabled={!canEdit}
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
            disabled={!canEdit}
            placeholder={data?.secret_key_set ? 'Laisser vide pour conserver la clé actuelle' : 'sk_test_xxxxxxxxxxxx'}
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
            disabled={!canEdit}
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
            disabled={!canEdit}
            placeholder="https://votre-site.fr/merci"
          />
          <p className="mt-1 text-xs text-ink-soft">
            Si vide, Stripe affichera son écran de confirmation par défaut.
          </p>
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canEdit && (
        <button onClick={() => void submit()} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}

      <div className="card p-5">
        <h3 className="font-semibold mb-2">Comment ça marche</h3>
        <ol className="space-y-2 text-sm list-decimal list-inside text-ink-soft">
          <li>Création d&apos;une commande (livraison ou retrait différé) en caisse.</li>
          <li>Choix du mode de règlement <strong>Lien de paiement</strong>.</li>
          <li>HelloPos crée une session Stripe Checkout, l&apos;envoie au client par email.</li>
          <li>Le client paye depuis chez lui ; Stripe nous notifie via webhook.</li>
          <li>La commande passe automatiquement en <strong>payée</strong>.</li>
        </ol>
      </div>
    </div>
  );
}
