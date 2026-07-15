'use client';

import { useEffect, useState } from 'react';
import { SCREEN_DELIVERY_DEFAULTS, type ScreenDeliverySettings } from '@/lib/settings/screen-delivery';
import StoreScopeSelect from '@/components/StoreScopeSelect';

export default function ScreenDeliveryForm({ canEdit, stores }: {
  canEdit: boolean; stores: { id: string; name: string }[];
}) {
  const [storeId, setStoreId] = useState<string>(stores[0]?.id ?? '');
  const [s, setS] = useState<ScreenDeliverySettings>(SCREEN_DELIVERY_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recharge la config écran/livraison de la boutique sélectionnée (repli org).
  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSaved(false);
    void (async () => {
      const r = await fetch(`/api/settings/screen-delivery?store_id=${encodeURIComponent(storeId)}`);
      if (cancelled) return;
      if (r.ok) setS((await r.json()).settings as ScreenDeliverySettings);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  function patch<K extends keyof ScreenDeliverySettings>(k: K, v: ScreenDeliverySettings[K]) {
    if (!canEdit) return;
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/screen-delivery', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, store_id: storeId || undefined }),
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
          <h1 className="text-2xl font-semibold tracking-tight">Écran &amp; Livraison</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Commande différée (retrait à date, livraison) et affichage client —
            configurables par boutique.
          </p>
        </div>
        <StoreScopeSelect stores={stores} value={storeId} onChange={setStoreId} />
      </div>

      <div className="card p-5 space-y-4">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <div>
            <div className="text-sm font-medium">Module activé</div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Quand activé, le bouton « Commande différée » apparaît dans
              la vue ticket en caisse.
            </p>
          </div>
          <input
            type="checkbox" className="h-5 w-5 shrink-0"
            checked={s.enabled}
            disabled={!canEdit}
            onChange={(e) => patch('enabled', e.target.checked)}
          />
        </label>

        {!s.enabled && (
          <div className="rounded-xl bg-gray-50 border border-border px-3 py-3 text-xs text-ink-soft">
            Les paramètres ci-dessous ne sont pas appliqués tant que le
            module n&apos;est pas activé.
          </div>
        )}

        <fieldset disabled={!canEdit || !s.enabled} className="space-y-4 disabled:opacity-60">
          <div>
            <h2 className="text-sm font-semibold mb-2">Paramètres de retrait</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-soft">Délai minimum (heures)</label>
                <input
                  type="number" min={0} step={1}
                  className="input mt-1"
                  value={s.min_lead_hours}
                  onChange={(e) => patch('min_lead_hours', Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Impossible de commander pour un retrait dans les X heures qui suivent.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-2">Livraison</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" className="h-4 w-4"
                checked={s.delivery_enabled}
                onChange={(e) => patch('delivery_enabled', e.target.checked)}
              />
              Autoriser la livraison en plus du retrait
            </label>
            {s.delivery_enabled && (
              <div className="mt-3 max-w-xs">
                <label className="text-xs font-medium text-ink-soft">Frais de livraison (€ TTC)</label>
                <input
                  type="number" min={0} step="0.5"
                  className="input mt-1"
                  value={s.delivery_fee}
                  onChange={(e) => patch('delivery_fee', Number(e.target.value) || 0)}
                />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-2">Écran client (vitrine)</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-ink-soft">URL de l&apos;écran client</label>
                <input
                  type="url"
                  className="input mt-1"
                  placeholder="https://..."
                  value={s.screen_url}
                  onChange={(e) => patch('screen_url', e.target.value)}
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Adresse à ouvrir sur l&apos;écran secondaire (application dédiée à venir).
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Message d&apos;accueil</label>
                <input
                  type="text" maxLength={200}
                  className="input mt-1"
                  value={s.screen_welcome}
                  onChange={(e) => patch('screen_welcome', e.target.value)}
                />
              </div>
            </div>
          </div>
        </fieldset>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

        {canEdit && (
          <button onClick={() => void submit()} disabled={saving || loading || !storeId} className="btn-primary">
            {loading ? 'Chargement…' : saving ? 'Enregistrement…' : 'Enregistrer cette boutique'}
          </button>
        )}
      </div>
    </div>
  );
}
