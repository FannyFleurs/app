'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useEffect, useState } from 'react';

interface Data {
  enabled: boolean;
  public_key: string;
  allowed_origins: string[];
  preset_amounts: number[];
  allow_custom_amount: boolean;
  min_amount: number;
  max_amount: number;
}

/** Parse un montant saisi à la française (virgule ou point décimal). */
function parseAmount(s: string): number {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export default function OnlineGiftCardsSettingsForm({ canEdit }: { canEdit: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [origins, setOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Section « Montants proposés » : brouillon local, enregistré explicitement
  // (pas à chaque frappe) — les 4 champs sont interdépendants (un montant
  // doit rester entre min et max), pas question de sauvegarder une valeur
  // transitoire incohérente pendant la saisie.
  const [presetAmounts, setPresetAmounts] = useState<string[]>([]);
  const [allowCustom, setAllowCustom] = useState(true);
  const [minAmount, setMinAmount] = useState('10');
  const [maxAmount, setMaxAmount] = useState('500');
  const [commerceSaving, setCommerceSaving] = useState(false);
  const [commerceSaved, setCommerceSaved] = useState(false);
  const [commerceError, setCommerceError] = useState<string | null>(null);

  function applyCommerceFromServer(j: Data) {
    setPresetAmounts(j.preset_amounts.map(String));
    setAllowCustom(j.allow_custom_amount);
    setMinAmount(String(j.min_amount));
    setMaxAmount(String(j.max_amount));
  }

  async function load() {
    const r = await fetch('/api/settings/online-gift-cards');
    if (r.ok) {
      const j = (await r.json()).settings as Data;
      setData(j);
      setEnabled(j.enabled);
      setOrigins(j.allowed_origins);
      applyCommerceFromServer(j);
    }
  }
  useEffect(() => { void load(); }, []);

  async function save(patch: Partial<{
    enabled: boolean; allowed_origins: string[];
    preset_amounts: number[]; allow_custom_amount: boolean; min_amount: number; max_amount: number;
  }>) {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/online-gift-cards', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const message = j.origin ? `Domaine invalide : « ${j.origin} »` : (j.message ?? j.error ?? 'Erreur');
      return { ok: false as const, message };
    }
    const j = (await r.json()).settings as Data;
    setData(j); setEnabled(j.enabled); setOrigins(j.allowed_origins);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    return { ok: true as const, settings: j };
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    const res = await save({ enabled: next });
    if (!res.ok) { setEnabled(!next); setError(res.message); }
  }

  async function addOrigin() {
    const value = newOrigin.trim();
    if (!value) return;
    const res = await save({ allowed_origins: [...origins, value] });
    if (res.ok) setNewOrigin(''); else setError(res.message);
  }

  async function removeOrigin(o: string) {
    const res = await save({ allowed_origins: origins.filter((x) => x !== o) });
    if (!res.ok) setError(res.message);
  }

  async function copyKey() {
    if (!data?.public_key) return;
    try {
      await navigator.clipboard.writeText(data.public_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* presse-papier indisponible */ }
  }

  async function regenerate() {
    if (!(await confirmThemed({
      title: 'Régénérer la clé publique ?',
      message: "L'ancienne clé cessera immédiatement de fonctionner. Toute intégration déjà en place sur votre site (une fois construite) devra être mise à jour avec la nouvelle clé.",
      confirmLabel: 'Régénérer',
      danger: true,
    }))) return;
    setRegenerating(true); setError(null);
    const r = await fetch('/api/settings/online-gift-cards/regenerate', { method: 'POST' });
    setRegenerating(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = (await r.json()).settings as Data;
    setData(j);
  }

  function addPresetAmount() {
    setPresetAmounts((cur) => [...cur, '']);
  }
  function updatePresetAmount(index: number, value: string) {
    setPresetAmounts((cur) => cur.map((v, i) => (i === index ? value : v)));
  }
  function removePresetAmount(index: number) {
    setPresetAmounts((cur) => cur.filter((_, i) => i !== index));
  }

  async function saveCommerce() {
    setCommerceError(null);
    const parsedAmounts = presetAmounts.map(parseAmount);
    if (parsedAmounts.some((a) => Number.isNaN(a))) {
      setCommerceError('Un des montants proposés n\'est pas un nombre valide.');
      return;
    }
    const min = parseAmount(minAmount);
    const max = parseAmount(maxAmount);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      setCommerceError('Montant minimum ou maximum invalide.');
      return;
    }
    setCommerceSaving(true);
    const res = await save({
      preset_amounts: parsedAmounts,
      allow_custom_amount: allowCustom,
      min_amount: min,
      max_amount: max,
    });
    setCommerceSaving(false);
    if (!res.ok) { setCommerceError(res.message); return; }
    applyCommerceFromServer(res.settings);
    setCommerceSaved(true);
    setTimeout(() => setCommerceSaved(false), 2500);
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cartes cadeaux en ligne</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Permet de proposer l&apos;achat de cartes cadeaux HelloPos depuis votre site
          internet. Les cartes émises sont valables dans toutes les boutiques de
          votre organisation.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <span>
            <span className="text-sm font-medium">Vendre mes cartes cadeaux en ligne</span>
            <span className="block text-xs text-ink-soft mt-0.5">
              Cette étape prépare l&apos;intégration (clé + domaines + montants) ; la page de
              vente et le paiement en ligne seront ajoutés dans une étape suivante.
            </span>
          </span>
          <input
            type="checkbox" className="h-5 w-5 shrink-0"
            checked={enabled} disabled={!canEdit || saving}
            onChange={(e) => void toggleEnabled(e.target.checked)}
          />
        </label>

        <div>
          <label className="text-sm font-medium text-ink-soft">Clé publique d&apos;intégration</label>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono break-all">
              {data?.public_key ?? '…'}
            </code>
            <button
              type="button" onClick={() => void copyKey()}
              className="btn-soft whitespace-nowrap shrink-0"
              disabled={!data?.public_key}
            >
              {copied ? '✓ Copié' : 'Copier'}
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Identifiant public — il n&apos;authentifie rien, il indique seulement à quelle
            organisation une demande se rapporte. Jamais un secret.
          </p>
          {canEdit && (
            <button
              type="button" onClick={() => void regenerate()}
              disabled={regenerating}
              className="btn-soft text-danger mt-2"
            >
              {regenerating ? 'Régénération…' : 'Régénérer la clé'}
            </button>
          )}
        </div>

        <div>
          <label className="text-sm font-medium text-ink-soft">Domaines autorisés</label>
          <p className="mt-0.5 text-xs text-ink-soft">
            Les sites depuis lesquels l&apos;intégration pourra être utilisée (ex.
            https://fanny-fleurs.com).
          </p>
          {origins.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {origins.map((o) => (
                <li key={o} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="font-mono truncate">{o}</span>
                  {canEdit && (
                    <button
                      type="button" onClick={() => void removeOrigin(o)}
                      aria-label={`Retirer ${o}`}
                      className="h-8 w-8 shrink-0 grid place-items-center rounded-lg text-ink-soft hover:bg-danger/10 hover:text-danger"
                    >✕</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <div className="mt-2 flex gap-2">
              <input
                className="input flex-1 font-mono text-sm"
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                placeholder="https://votre-site.fr"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addOrigin(); } }}
              />
              <button type="button" onClick={() => void addOrigin()} className="btn-soft whitespace-nowrap">
                + Ajouter
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Enregistré</div>}

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">Montants proposés</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            Les montants de carte cadeau proposés à l&apos;achat sur votre site, en euros.
          </p>
        </div>

        <div className="space-y-1.5">
          {presetAmounts.map((amount, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text" inputMode="decimal"
                className="input w-32 text-sm"
                value={amount}
                disabled={!canEdit}
                onChange={(e) => updatePresetAmount(i, e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="0,00"
              />
              <span className="text-sm text-ink-soft">€</span>
              {canEdit && (
                <button
                  type="button" onClick={() => removePresetAmount(i)}
                  aria-label="Retirer ce montant"
                  className="h-8 w-8 grid place-items-center rounded-lg text-ink-soft hover:bg-danger/10 hover:text-danger"
                >✕</button>
              )}
            </div>
          ))}
        </div>
        {canEdit && (
          <button type="button" onClick={addPresetAmount} className="btn-soft whitespace-nowrap">
            + Ajouter un montant
          </button>
        )}

        <label className="flex items-center gap-2 text-sm pt-2 border-t border-border/60">
          <input
            type="checkbox" checked={allowCustom} disabled={!canEdit}
            onChange={(e) => setAllowCustom(e.target.checked)}
          />
          Autoriser le montant libre
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Montant minimum</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text" inputMode="decimal"
                className="input text-sm"
                value={minAmount} disabled={!canEdit}
                onChange={(e) => setMinAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="text-sm text-ink-soft">€</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Montant maximum</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text" inputMode="decimal"
                className="input text-sm"
                value={maxAmount} disabled={!canEdit}
                onChange={(e) => setMaxAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              />
              <span className="text-sm text-ink-soft">€</span>
            </div>
          </div>
        </div>

        {commerceError && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{commerceError}</div>}
        {commerceSaved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Montants enregistrés</div>}

        {canEdit && (
          <button
            type="button" onClick={() => void saveCommerce()}
            disabled={commerceSaving}
            className="btn-primary"
          >
            {commerceSaving ? 'Enregistrement…' : 'Enregistrer les montants'}
          </button>
        )}
      </div>
    </div>
  );
}
