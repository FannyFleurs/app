'use client';

import { useState } from 'react';
import { LABEL_SIZE_PRESETS, type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print-core';
import LabelEditor, { LabelPreview } from './LabelEditor';

const SAMPLE: LabelProduct = {
  // Nom volontairement long : c'est le cas qui posait problème à l'impression.
  name: 'Bouquet de roses parfumées grand modèle',
  sku: 'ROSE-01',
  barcode: '3401234567890',
  sale_price_ttc: 24.9,
  discount_type: 'percent',
  discount_value: 10,
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
              <label className="text-sm">
                <span className="block text-xs font-medium text-ink-soft mb-1">Écart (mm)</span>
                <input type="number" step={0.5} min={0} max={20} className="input h-10 w-28 tabular-nums"
                       value={form.gap_mm}
                       disabled={!canEdit} onChange={(e) => set('gap_mm', Number(e.target.value) || 0)} />
              </label>
            </div>
            {/* Le lot part en UNE image continue : si le pas déclaré ne colle
                pas au rouleau, le décalage s'accumule d'étiquette en étiquette. */}
            <p className="text-xs text-ink-soft">
              L&apos;écart est le blanc entre deux étiquettes du rouleau.
              Papier <strong>prédécoupé</strong> : mesure ce blanc (3 mm sur le rouleau d&apos;origine).
              Papier à <strong>marque noire</strong> : le pas est la hauteur d&apos;étiquette,
              donc écart <strong>0</strong> — ou la marge que tu veux laisser au-dessus de la marque
              (hauteur + écart doivent toujours faire le pas réel, marque à marque).
            </p>
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

          {/* Calage machine — distinct de la mise en page */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Calage de l&apos;imprimante</h2>
            <p className="text-sm text-ink-soft">
              Si l&apos;impression tombe trop bas sur l&apos;étiquette — marge haute
              excessive et bas rogné — mesure le décalage sur une étiquette sortie et
              saisis-le en négatif pour remonter le contenu d&apos;autant. Même chose
              en largeur : quand le média n&apos;est pas centré sous la tête, le contenu
              sort d&apos;un bord et laisse un blanc à l&apos;autre.
              Ce réglage ne concerne que l&apos;impression : l&apos;aperçu montre le
              résultat attendu une fois le calage juste.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm inline-flex items-end gap-3">
                <span>
                  <span className="block text-xs font-medium text-ink-soft mb-1">
                    Décalage vertical (mm)
                  </span>
                  <input type="number" step={0.5} min={-15} max={15}
                         className="input h-10 w-28 tabular-nums" value={form.print_offset_y_mm}
                         disabled={!canEdit}
                         onChange={(e) => set('print_offset_y_mm', Number(e.target.value) || 0)} />
                </span>
                <span className="pb-2 text-xs text-ink-soft">
                  négatif = vers le haut
                </span>
              </label>
              <label className="text-sm inline-flex items-end gap-3">
                <span>
                  <span className="block text-xs font-medium text-ink-soft mb-1">
                    Décalage horizontal (mm)
                  </span>
                  <input type="number" step={0.5} min={-15} max={15}
                         className="input h-10 w-28 tabular-nums" value={form.print_offset_x_mm}
                         disabled={!canEdit}
                         onChange={(e) => set('print_offset_x_mm', Number(e.target.value) || 0)} />
                </span>
                <span className="pb-2 text-xs text-ink-soft">
                  négatif = vers la gauche
                </span>
              </label>
            </div>
          </div>

          {/* Composition : ordre fixe, force relative réglable */}
          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Disposition</h2>
            <LabelEditor
              settings={form}
              canEdit={canEdit}
              onChange={(layout) => set('layout', layout)}
            />
          </div>

          {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
          {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}
          {canEdit && (
            <button onClick={() => void submit()} disabled={saving} className="btn-primary">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>

        {/* Aperçu — même moteur de mise en page que l'impression. Cet encart
            avait sa propre composition, qui ne ressemblait ni au rendu
            thermique ni au repli PDF : trois dessins pour une seule étiquette. */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-2">Aperçu</div>
          <div className="rounded-2xl border border-border bg-white p-4 grid place-items-center">
            <LabelPreview settings={form} product={SAMPLE} widthPx={220} />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Exemple à l&apos;échelle du format choisi. C&apos;est ce qui sera imprimé.
          </p>
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
