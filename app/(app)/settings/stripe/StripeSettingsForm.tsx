'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface Data {
  enabled: boolean;
  publishable_key: string;
  secret_key_masked: string;
  secret_key_set: boolean;
  webhook_secret_masked: string;
  webhook_secret_set: boolean;
  return_url: string;
}

export default function StripeSettingsForm(
  { canEdit, stores }: { canEdit: boolean; stores: { id: string; name: string }[] },
) {
  const [storeId, setStoreId] = useState<string>(stores[0]?.id ?? '');
  const [data, setData] = useState<Data | null>(null);
  const [inherited, setInherited] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pk, setPk] = useState('');
  const [sk, setSk] = useState('');
  const [whs, setWhs] = useState('');
  const [returnUrl, setReturnUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)charge la config Stripe de la boutique sélectionnée — même
  // sélecteur/qs que /settings/email.
  useEffect(() => {
    setData(null); setError(null); setSaved(false); setSk(''); setWhs('');
    const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    void (async () => {
      const r = await fetch(`/api/settings/stripe${qs}`);
      if (r.ok) {
        const j = await r.json();
        setData(j.settings);
        setInherited(!!j.inherited);
        setEnabled(j.settings.enabled);
        setPk(j.settings.publishable_key);
        setReturnUrl(j.settings.return_url);
      }
    })();
  }, [storeId]);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/stripe', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId || undefined,
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
    // Recharge (masquage à jour)
    const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    const refresh = await fetch(`/api/settings/stripe${qs}`);
    if (refresh.ok) {
      const j = await refresh.json();
      setData(j.settings);
      setInherited(!!j.inherited);
    }
  }

  const currentStoreName = stores.find((s) => s.id === storeId)?.name ?? null;

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <PageHeader
        title="Stripe — Paiement en ligne"
        subtitle="Configurez votre compte Stripe pour les liens de paiement et les cartes cadeaux en ligne — propre à chaque boutique."
        actions={null}
      />

      {stores.length === 0 && (
        <div className="card p-4 text-sm text-ink-soft">
          Aucune boutique accessible : la configuration s’applique au niveau de l’organisation.
        </div>
      )}

      {stores.length > 0 && (
        <label className="block">
          <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
          <select
            className="input h-10 w-full sm:w-72"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </label>
      )}

      {!data ? (
        <div className="card p-8 text-sm text-ink-soft">Chargement…</div>
      ) : (
      <>
      <div className="card p-4 flex items-center justify-between gap-3 text-sm">
        <span>
          Boutique : <strong>{currentStoreName ?? 'Organisation'}</strong>
        </span>
        <span className={data.secret_key_set ? 'text-success font-medium' : 'text-ink-soft'}>
          Compte Stripe : {data.secret_key_set ? 'configuré' : 'non configuré'}
        </span>
      </div>

      {inherited && (
        <div className="card p-3 text-xs text-ink-soft border-l-4 border-amber-400">
          Cette boutique n’a pas encore son propre compte Stripe : les valeurs affichées
          sont héritées de la configuration organisation. Une boutique sans configuration
          propre ne reçoit jamais les identifiants d’une autre boutique — enregistre pour
          rendre ce compte spécifique à cette boutique.
        </div>
      )}

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
          {data.secret_key_set && !sk && (
            <div className="mt-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono">
              {data.secret_key_masked}
              <span className="ml-2 text-xs text-ink-soft">(saisie pour remplacer)</span>
            </div>
          )}
          <input
            type="password"
            className={`input ${data.secret_key_set ? 'mt-2' : 'mt-1'} font-mono text-sm`}
            value={sk} onChange={(e) => setSk(e.target.value)}
            disabled={!canEdit}
            placeholder={data.secret_key_set ? 'Laisser vide pour conserver la clé actuelle' : 'sk_test_xxxxxxxxxxxx'}
          />
          <p className="mt-1 text-xs text-ink-soft">
            Stockée chiffrée en base. Jamais réaffichée en clair.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Webhook signing secret (whsec_…)</label>
          {data.webhook_secret_set && !whs && (
            <div className="mt-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono">
              {data.webhook_secret_masked}
            </div>
          )}
          <input
            type="password"
            className={`input ${data.webhook_secret_set ? 'mt-2' : 'mt-1'} font-mono text-sm`}
            value={whs} onChange={(e) => setWhs(e.target.value)}
            disabled={!canEdit}
            placeholder={data.webhook_secret_set ? 'Laisser vide pour conserver' : 'whsec_xxxxxxxxxxxx'}
          />
          <p className="mt-1 text-xs text-ink-soft">
            URL webhook à configurer dans Stripe (le MÊME endpoint pour toutes les
            boutiques — il détermine lui-même quel compte a signé chaque événement) :{' '}
            <code className="bg-gray-100 px-1 rounded">https://VOTRE-DOMAINE/api/webhooks/stripe</code>
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

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

        {canEdit && (
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer cette boutique'}
          </button>
        )}
      </div>
      </>
      )}

      <div className="card p-5">
        <h3 className="font-semibold mb-2">Comment ça marche</h3>
        <ol className="space-y-2 text-sm list-decimal list-inside text-ink-soft">
          <li>Création d&apos;une commande (livraison ou retrait différé) en caisse, ou achat d&apos;une carte cadeau en ligne.</li>
          <li>HelloPos crée une session Stripe Checkout avec le compte de LA BOUTIQUE concernée.</li>
          <li>Le client paye depuis chez lui ; Stripe nous notifie via webhook.</li>
          <li>La commande passe automatiquement en <strong>payée</strong> (ou la carte cadeau est émise).</li>
        </ol>
      </div>
    </div>
  );
}
