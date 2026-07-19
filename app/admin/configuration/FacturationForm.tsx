'use client';

import { useState } from 'react';
import { SaveBar, savePlatformConfig } from './_shared';

export type FacturationData = {
  stripe_publishable_key: string;
  stripe_secret_key: string;
  stripe_secret_key_set: boolean;
  stripe_webhook_secret: string;
  stripe_webhook_secret_set: boolean;
  stripe_price_essentiel: string;
  stripe_price_croissance: string;
  stripe_price_reseau: string;
  trial_days: number;
  plan_essentiel_price: string;
  plan_croissance_price: string;
  plan_reseau_price: string;
  plan_essentiel_name: string;
  plan_croissance_name: string;
  plan_reseau_name: string;
  stripe_price_extra_register: string;
  addon_register_price: string;
};

export default function FacturationForm({ initial }: { initial: FacturationData }) {
  const [s, setS] = useState<FacturationData>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof FacturationData>(k: K, v: FacturationData[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    // On envoie l'ensemble ; le back-end ignore les secrets laissés vides.
    const res = await savePlatformConfig({
      stripe_publishable_key: s.stripe_publishable_key,
      stripe_secret_key: s.stripe_secret_key,
      stripe_webhook_secret: s.stripe_webhook_secret,
      stripe_price_essentiel: s.stripe_price_essentiel,
      stripe_price_croissance: s.stripe_price_croissance,
      stripe_price_reseau: s.stripe_price_reseau,
      trial_days: s.trial_days,
      plan_essentiel_price: s.plan_essentiel_price,
      plan_croissance_price: s.plan_croissance_price,
      plan_reseau_price: s.plan_reseau_price,
      plan_essentiel_name: s.plan_essentiel_name,
      plan_croissance_name: s.plan_croissance_name,
      plan_reseau_name: s.plan_reseau_name,
      stripe_price_extra_register: s.stripe_price_extra_register,
      addon_register_price: s.addon_register_price,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    // Réinitialise les champs secrets + rafraîchit les flags "défini".
    setS((prev) => ({
      ...prev,
      stripe_secret_key: '',
      stripe_webhook_secret: '',
      stripe_secret_key_set: !!res.settings.stripe_secret_key_set,
      stripe_webhook_secret_set: !!res.settings.stripe_webhook_secret_set,
    }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Facturation Stripe (abonnements)</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Compte Stripe qui encaisse les abonnements des boutiques. Créez
            2 produits/prix récurrents (Essentiel 29€, Croissance 59€) dans
            votre dashboard Stripe et collez leurs <strong>Price ID</strong>
            (price_…) ci-dessous. Webhook à déclarer :
            <code className="bg-gray-100 px-1 rounded ml-1 break-all">https://VOTRE-DOMAINE/api/webhooks/stripe-billing</code>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Clé publique (pk_…)</label>
            <input className="input mt-1 font-mono text-sm" value={s.stripe_publishable_key}
                   onChange={(e) => patch('stripe_publishable_key', e.target.value)}
                   placeholder="pk_live_…" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">
              Clé secrète (sk_…)
              {s.stripe_secret_key_set && <span className="ml-1 text-success">· déjà définie</span>}
            </label>
            <input type="password" className="input mt-1 font-mono text-sm" value={s.stripe_secret_key}
                   onChange={(e) => patch('stripe_secret_key', e.target.value)}
                   placeholder={s.stripe_secret_key_set ? 'Laisser vide pour conserver' : 'sk_live_…'} />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-soft">
            Webhook signing secret (whsec_…)
            {s.stripe_webhook_secret_set && <span className="ml-1 text-success">· déjà défini</span>}
          </label>
          <input type="password" className="input mt-1 font-mono text-sm" value={s.stripe_webhook_secret}
                 onChange={(e) => patch('stripe_webhook_secret', e.target.value)}
                 placeholder={s.stripe_webhook_secret_set ? 'Laisser vide pour conserver' : 'whsec_…'} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Price ID — Essentiel</label>
            <input className="input mt-1 font-mono text-sm" value={s.stripe_price_essentiel}
                   onChange={(e) => patch('stripe_price_essentiel', e.target.value)}
                   placeholder="price_…" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Price ID — Croissance</label>
            <input className="input mt-1 font-mono text-sm" value={s.stripe_price_croissance}
                   onChange={(e) => patch('stripe_price_croissance', e.target.value)}
                   placeholder="price_…" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Price ID — Réseau</label>
            <input className="input mt-1 font-mono text-sm" value={s.stripe_price_reseau}
                   onChange={(e) => patch('stripe_price_reseau', e.target.value)}
                   placeholder="price_…" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Jours d&apos;essai</label>
            <input type="number" min={0} max={90} className="input mt-1" value={s.trial_days}
                   onChange={(e) => patch('trial_days', Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Prix affiché Essentiel (€)</label>
            <input className="input mt-1" value={s.plan_essentiel_price}
                   onChange={(e) => patch('plan_essentiel_price', e.target.value)} placeholder="29" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Prix affiché Croissance (€)</label>
            <input className="input mt-1" value={s.plan_croissance_price}
                   onChange={(e) => patch('plan_croissance_price', e.target.value)} placeholder="59" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Prix affiché Réseau</label>
            <input className="input mt-1" value={s.plan_reseau_price}
                   onChange={(e) => patch('plan_reseau_price', e.target.value)} placeholder="Sur mesure" />
          </div>
        </div>
        <p className="text-xs text-ink-soft">
          Les montants affichés sont cosmétiques : ils doivent correspondre
          aux prix réels définis dans Stripe (via les Price IDs). Réseau
          accepte un texte libre (ex. « Sur mesure »).
        </p>

        <div className="pt-2 border-t border-border">
          <h3 className="text-sm font-semibold mb-2">Noms des offres</h3>
          <p className="mb-2 text-xs text-ink-soft">
            Personnalisez les libellés affichés dans l&apos;application et sur
            la page d&apos;abonnement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-soft">Offre 1</label>
              <input className="input mt-1" value={s.plan_essentiel_name}
                     onChange={(e) => patch('plan_essentiel_name', e.target.value)} placeholder="Essentiel" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Offre 2</label>
              <input className="input mt-1" value={s.plan_croissance_name}
                     onChange={(e) => patch('plan_croissance_name', e.target.value)} placeholder="Croissance" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Offre 3</label>
              <input className="input mt-1" value={s.plan_reseau_name}
                     onChange={(e) => patch('plan_reseau_name', e.target.value)} placeholder="Réseau" />
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <h3 className="text-sm font-semibold mb-2">Option — caisse supplémentaire</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-soft">Price ID (récurrent /mois)</label>
              <input className="input mt-1 font-mono text-sm" value={s.stripe_price_extra_register}
                     onChange={(e) => patch('stripe_price_extra_register', e.target.value)}
                     placeholder="price_…" />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Prix affiché (€)</label>
              <input className="input mt-1" value={s.addon_register_price}
                     onChange={(e) => patch('addon_register_price', e.target.value)} placeholder="9" />
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Permet aux clients Essentiel d&apos;ajouter des caisses moyennant
            un supplément mensuel.
          </p>
        </div>
        <p className="text-xs text-ink-soft">
          Tant que la clé secrète et au moins un Price ID ne sont pas
          renseignés, l&apos;inscription reste en essai gratuit sans paiement.
        </p>
      </section>

      <SaveBar saving={saving} saved={saved} error={error} onSave={() => void submit()} />
    </div>
  );
}
