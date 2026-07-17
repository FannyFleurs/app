'use client';

import { useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { ean13Svg } from '@/lib/services/barcode';
import { LABEL_SIZE_PRESETS, type LabelSettings } from '@/lib/settings/label';

const SAMPLE = {
  name: 'Bouquet de roses',
  sku: 'ROSE-01',
  barcode: '3401234567890',
  sale_price_ttc: 24.9,
  discountPct: 10,
};

export default function LabelSettingsForm({ initial, canEdit }: {
  initial: LabelSettings; canEdit: boolean;
}) {
  const [form, setForm] = useState<LabelSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof LabelSettings>(k: K, v: LabelSettings[K]) {
    if (!canEdit) return;
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/labels', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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

  const disc = form.show_discount
    ? Math.round(SAMPLE.sale_price_ttc * (1 - SAMPLE.discountPct / 100) * 100) / 100
    : null;
  const svg = ean13Svg(SAMPLE.barcode, { module: 2, height: 50 });

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres étiquettes</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Un seul format d&apos;étiquette pour toute l&apos;impression, et le choix des éléments imprimés.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-5">
          {/* Format */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Format de l&apos;étiquette</h2>
            <div className="flex flex-wrap gap-2">
              {LABEL_SIZE_PRESETS.map((s) => {
                const active = form.width_mm === s.w && form.height_mm === s.h;
                return (
                  <button key={s.label} type="button" disabled={!canEdit}
                    onClick={() => setForm((f) => ({ ...f, width_mm: s.w, height_mm: s.h }))}
                    className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                      active ? 'accent-bar text-white border-transparent' : 'bg-white border-border hover:bg-gray-50'
                    }`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-end gap-3">
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft mb-1">Largeur (mm)</span>
                <input type="number" min={10} max={200} className="input h-10 w-28" value={form.width_mm}
                       disabled={!canEdit} onChange={(e) => set('width_mm', Number(e.target.value) || 0)} />
              </label>
              <span className="pb-2 text-ink-soft">×</span>
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft mb-1">Hauteur (mm)</span>
                <input type="number" min={10} max={200} className="input h-10 w-28" value={form.height_mm}
                       disabled={!canEdit} onChange={(e) => set('height_mm', Number(e.target.value) || 0)} />
              </label>
            </div>
          </div>

          {/* Éléments */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Éléments à imprimer</h2>
            <Check label="Nom de l'article" checked={form.show_name} disabled={!canEdit} onChange={(v) => set('show_name', v)} />
            <Check label="Référence (SKU)" checked={form.show_sku} disabled={!canEdit} onChange={(v) => set('show_sku', v)} />
            <Check label="Code-barres (EAN-13)" checked={form.show_barcode} disabled={!canEdit} onChange={(v) => set('show_barcode', v)} />
            <Check label="Prix" checked={form.show_price} disabled={!canEdit} onChange={(v) => set('show_price', v)} />
            <Check label="Prix remisé (si remise sur l'article)"
                   checked={form.show_discount} disabled={!canEdit || !form.show_price}
                   onChange={(v) => set('show_discount', v)} />
          </div>

          {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}
          {canEdit && (
            <button onClick={() => void submit()} disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>

        {/* Aperçu */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-2">Aperçu</div>
          <div className="rounded-2xl border border-border bg-white p-4 grid place-items-center">
            <div
              className="border border-dashed border-border p-2 flex flex-col items-center justify-between text-center overflow-hidden"
              style={{ width: `${form.width_mm * 3}px`, height: `${form.height_mm * 3}px` }}
            >
              {form.show_name && <div className="font-semibold leading-tight text-sm line-clamp-2">{SAMPLE.name}</div>}
              {form.show_sku && <div className="font-mono text-[10px] text-ink-soft">{SAMPLE.sku}</div>}
              {form.show_barcode && (
                <div className="w-full flex-1 min-h-0 flex items-center justify-center"
                     dangerouslySetInnerHTML={{ __html: svg ?? '' }} />
              )}
              {form.show_price && (
                <div className="font-bold text-base whitespace-nowrap">
                  {disc != null && (
                    <span className="line-through text-ink-soft font-normal text-xs mr-1">{formatEUR(SAMPLE.sale_price_ttc)}</span>
                  )}
                  {formatEUR(disc ?? SAMPLE.sale_price_ttc)}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-soft">Exemple à l&apos;échelle du format choisi.</p>
        </div>
      </div>
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
