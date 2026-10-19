'use client';

import { useEffect, useState } from 'react';

interface PaymentMethod {
  id: string;
  kind: string;
  label: string;
  is_active: boolean;
}

interface Settings {
  enabled: boolean;
  web_payment_method_id: string | null;
  ogf_payment_method_id: string | null;
}

const DEFAULTS: Settings = { enabled: false, web_payment_method_id: null, ogf_payment_method_id: null };

/**
 * Modes de règlement par défaut des commandes WEB/OGF reçues de l'app
 * commande (voir lib/services/order-intake.ts) : si activé, une commande de
 * cette source est encaissée automatiquement dès sa réception — même
 * boutique fermée — sur la caisse virtuelle dédiée (lib/services/
 * virtual-register.ts), avec le mode de règlement choisi ici. Sinon,
 * comportement inchangé : la commande reste "en attente", le caissier
 * l'encaisse normalement.
 */
export default function OrderAutoCheckoutSection({ canWrite, stores, methods }: {
  canWrite: boolean;
  stores: { id: string; name: string }[];
  methods: PaymentMethod[];
}) {
  const multiStore = stores.length > 1;
  const [storeId, setStoreId] = useState<string>(multiStore ? (stores[0]?.id ?? '') : '');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modes utilisables sans tiroir ni client physiquement présent.
  const ALLOWED_KINDS = new Set(['card', 'check', 'transfer', 'deferred', 'other', 'payment_link']);
  const options = methods.filter((m) => m.is_active && ALLOWED_KINDS.has(m.kind));

  async function load() {
    setSettings(null); setError(null);
    const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
    const r = await fetch(`/api/settings/order-auto-checkout${qs}`);
    setSettings(r.ok ? (await r.json()).settings : DEFAULTS);
  }
  useEffect(() => { void load(); }, [storeId]);

  async function save(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next); // optimiste
    setSaving(true); setError(null);
    const r = await fetch('/api/settings/order-auto-checkout', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId || undefined, ...patch }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      void load(); // ré-aligne sur l'état serveur réel
      return;
    }
    setSettings((await r.json()).settings);
  }

  const currentStoreName = stores.find((s) => s.id === storeId)?.name ?? null;

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Commandes automatiques (WEB / OGF)</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Une commande reçue de l&apos;app commande avec cette source est encaissée automatiquement à sa réception
          — même boutique fermée — avec le mode de règlement choisi ci-dessous, au lieu de rester « en attente ».
          Laissez un mode sur « — » pour garder le comportement actuel sur cette source (la commande reste en
          attente, le caissier l&apos;encaisse normalement).
        </p>
      </div>

      {multiStore && (
        <label className="block">
          <span className="block text-xs font-medium text-ink-soft mb-1">Boutique concernée</span>
          <select
            className="input h-10 w-full sm:w-72"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </label>
      )}

      {!settings ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={settings.enabled} disabled={!canWrite || saving}
              onChange={(e) => void save({ enabled: e.target.checked })}
            />
            Activer l&apos;encaissement automatique
            {multiStore && currentStoreName ? ` pour ${currentStoreName}` : ''}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-soft">Mode par défaut — commandes WEB</span>
              <select
                className="input h-10 w-full mt-1"
                value={settings.web_payment_method_id ?? ''}
                disabled={!canWrite || saving}
                onChange={(e) => void save({ web_payment_method_id: e.target.value || null })}
              >
                <option value="">—</option>
                {options.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Mode par défaut — commandes OGF</span>
              <select
                className="input h-10 w-full mt-1"
                value={settings.ogf_payment_method_id ?? ''}
                disabled={!canWrite || saving}
                onChange={(e) => void save({ ogf_payment_method_id: e.target.value || null })}
              >
                <option value="">—</option>
                {options.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>

          {options.length === 0 && (
            <p className="text-xs text-warning">
              Aucun mode de règlement utilisable ici n&apos;est actif — activez-en un ci-dessus (carte, virement,
              différé client, lien de paiement…).
            </p>
          )}
        </>
      )}

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
    </div>
  );
}
