'use client';

import { useState } from 'react';
import type { EInvoicingSettings, EInvoiceFormat, EInvoiceMode } from '@/lib/settings/einvoicing';

type FormData = EInvoicingSettings & {
  pdp_api_key_masked: string;
  pdp_api_key_set: boolean;
};

const FORMAT_LABELS: Record<EInvoiceFormat, string> = {
  'factur-x': 'Factur-X (PDF/A-3 + XML) — recommandé',
  ubl: 'UBL (XML)',
  cii: 'CII (XML)',
};

const MODE_LABELS: Record<EInvoiceMode, { title: string; desc: string }> = {
  off: {
    title: 'Préparation seule',
    desc: 'On collecte les données obligatoires (SIREN/SIRET, TVA…) sans transmettre. À activer dès maintenant.',
  },
  pdp: {
    title: 'Plateforme agréée (PDP)',
    desc: 'Transmission via une plateforme de dématérialisation partenaire, le moment venu.',
  },
  export: {
    title: 'Export JSON',
    desc: 'Génération d\'un fichier JSON normalisé par facture, à envoyer soi-même à une plateforme.',
  },
};

export default function EInvoicingForm({ initial, canEdit }: {
  initial: FormData; canEdit: boolean;
}) {
  const [s, setS] = useState<FormData>(initial);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof EInvoicingSettings>(k: K, v: EInvoicingSettings[K]) {
    if (!canEdit) return;
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const body: Record<string, unknown> = {
      enabled: s.enabled,
      mode: s.mode,
      format: s.format,
      pdp_name: s.pdp_name,
      pdp_endpoint: s.pdp_endpoint,
      auto_send: s.auto_send,
    };
    if (apiKey.trim()) body.pdp_api_key = apiKey.trim();
    const r = await fetch('/api/settings/einvoicing', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    setS(j.settings);
    setApiKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="p-8 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturation électronique</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Préparez la réforme française (généralisation 2026-2027). Les données
          obligatoires sont collectées dès maintenant ; la connexion à une
          plateforme agréée (PDP) ou l&apos;export se configure ici, sans rien
          figer.
        </p>
      </div>

      <div className="card p-5 space-y-4">
        <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
          <div>
            <div className="text-sm font-medium">Préparation activée</div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Affiche les champs e-facturation sur les fiches clients et
              débloque l&apos;export des factures.
            </p>
          </div>
          <input
            type="checkbox" className="h-5 w-5 shrink-0"
            checked={s.enabled}
            disabled={!canEdit}
            onChange={(e) => patch('enabled', e.target.checked)}
          />
        </label>

        <fieldset disabled={!canEdit || !s.enabled} className="space-y-4 disabled:opacity-60">
          <div>
            <h2 className="text-sm font-semibold mb-2">Mode de transmission</h2>
            <div className="space-y-2">
              {(Object.keys(MODE_LABELS) as EInvoiceMode[]).map((m) => (
                <label
                  key={m}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                    s.mode === m ? 'border-accent bg-accent-soft/40' : 'border-border'
                  }`}
                >
                  <input
                    type="radio" name="mode" className="mt-0.5"
                    checked={s.mode === m}
                    onChange={() => patch('mode', m)}
                  />
                  <div>
                    <div className="text-sm font-medium">{MODE_LABELS[m].title}</div>
                    <div className="text-xs text-ink-soft">{MODE_LABELS[m].desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold">Format de facture</label>
            <select
              className="input mt-1"
              value={s.format}
              onChange={(e) => patch('format', e.target.value as EInvoiceFormat)}
            >
              {(Object.keys(FORMAT_LABELS) as EInvoiceFormat[]).map((f) => (
                <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
              ))}
            </select>
          </div>

          {s.mode === 'pdp' && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="text-sm font-semibold">Plateforme agréée (PDP)</h3>
              <div>
                <label className="text-xs font-medium text-ink-soft">Nom de la plateforme</label>
                <input
                  className="input mt-1"
                  value={s.pdp_name}
                  onChange={(e) => patch('pdp_name', e.target.value)}
                  placeholder="ex : nom du prestataire"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Endpoint API</label>
                <input
                  className="input mt-1 font-mono text-sm"
                  value={s.pdp_endpoint}
                  onChange={(e) => patch('pdp_endpoint', e.target.value)}
                  placeholder="https://api.plateforme.fr/…"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-soft">Clé API</label>
                {s.pdp_api_key_set && !apiKey && (
                  <div className="mt-1 rounded-xl border border-border bg-gray-50 px-3 py-2 text-sm font-mono">
                    {s.pdp_api_key_masked}
                    <span className="ml-2 text-xs text-ink-soft">(saisir pour remplacer)</span>
                  </div>
                )}
                <input
                  type="password"
                  className={`input font-mono text-sm ${s.pdp_api_key_set ? 'mt-2' : 'mt-1'}`}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={s.pdp_api_key_set ? 'Laisser vide pour conserver' : 'Clé fournie par la plateforme'}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.auto_send}
                  onChange={(e) => patch('auto_send', e.target.checked)}
                />
                Envoyer automatiquement à la validation de la facture
              </label>
            </div>
          )}

          <div className="rounded-xl bg-gray-50 border border-border px-3 py-3 text-xs text-ink-soft">
            Rappel : chaque facture pourra être exportée au format JSON normalisé
            (bouton « Export e-facture » sur la facture), pivot neutre convertible
            en Factur-X / UBL / CII par la plateforme.
          </div>
        </fieldset>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Enregistré</div>}

        {canEdit && (
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>
    </div>
  );
}
