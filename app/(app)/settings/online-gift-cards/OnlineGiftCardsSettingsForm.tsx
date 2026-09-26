'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useEffect, useState } from 'react';

interface Data {
  enabled: boolean;
  public_key: string;
  allowed_origins: string[];
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

  async function load() {
    const r = await fetch('/api/settings/online-gift-cards');
    if (r.ok) {
      const j = (await r.json()).settings as Data;
      setData(j);
      setEnabled(j.enabled);
      setOrigins(j.allowed_origins);
    }
  }
  useEffect(() => { void load(); }, []);

  async function save(patch: { enabled?: boolean; allowed_origins?: string[] }) {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/online-gift-cards', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.origin ? `Domaine invalide : « ${j.origin} »` : (j.message ?? j.error ?? 'Erreur'));
      return false;
    }
    const j = (await r.json()).settings as Data;
    setData(j); setEnabled(j.enabled); setOrigins(j.allowed_origins);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    return true;
  }

  async function toggleEnabled(next: boolean) {
    setEnabled(next);
    await save({ enabled: next });
  }

  async function addOrigin() {
    const value = newOrigin.trim();
    if (!value) return;
    const ok = await save({ allowed_origins: [...origins, value] });
    if (ok) setNewOrigin('');
  }

  async function removeOrigin(o: string) {
    await save({ allowed_origins: origins.filter((x) => x !== o) });
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
              Cette étape prépare l&apos;intégration (clé + domaines) ; la page de vente et le
              paiement en ligne seront ajoutés dans une étape suivante.
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
    </div>
  );
}
