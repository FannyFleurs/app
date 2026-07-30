'use client';

import { useEffect, useState } from 'react';
import { RECEIPT_DEFAULTS, type ReceiptSettings } from '@/lib/settings/receipt';

export default function ReceiptSettingsForm({ stores, canEdit }: {
  stores: { id: string; name: string }[]; canEdit: boolean;
}) {
  const [storeId, setStoreId] = useState<string>(stores[0]?.id ?? '');
  const [form, setForm] = useState<ReceiptSettings>(RECEIPT_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Charge la configuration ticket de la boutique sélectionnée (avec repli
  // sur le modèle organisation tant que la boutique n'a rien enregistré).
  useEffect(() => {
    if (!storeId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null); setSaved(false);
    void (async () => {
      const r = await fetch(`/api/settings/receipt?store_id=${encodeURIComponent(storeId)}`);
      if (cancelled) return;
      if (r.ok) setForm((await r.json()).settings as ReceiptSettings);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/settings/receipt', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, store_id: storeId || undefined }),
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

  function onLogoFile(file: File) {
    if (file.size > 200_000) {
      setError('Logo trop volumineux (max ~200 kB).'); return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, logo_data_url: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Paramétrage ticket</h1>
          <p className="mt-1 text-sm text-ink-soft">
            En-tête, pied de page, options d&apos;impression — <strong>propre à chaque boutique</strong>.
          </p>
        </div>
        {stores.length > 0 && (
          <label className="text-sm">
            <span className="block text-xs font-medium text-ink-soft mb-1">Boutique</span>
            <select
              className="input h-10 min-w-[12rem]"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {stores.length === 0 && (
        <div className="rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
          Aucune boutique accessible : impossible de paramétrer le ticket.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-5">
          <div className="card p-5 space-y-4">
            <h2 className="font-semibold">En-tête du ticket</h2>

            <Field label="Logo">
              <div className="flex items-center gap-3">
                {form.logo_data_url ? (
                  <img src={form.logo_data_url} alt="logo"
                       className="h-16 w-16 object-contain rounded-lg border border-border bg-white p-1" />
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed border-border grid place-items-center text-ink-soft text-xs">
                    Pas de logo
                  </div>
                )}
                <input
                  type="file" accept="image/png,image/jpeg"
                  disabled={!canEdit}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoFile(f); }}
                />
                {form.logo_data_url && (
                  <button onClick={() => setForm({ ...form, logo_data_url: '' })}
                          disabled={!canEdit}
                          className="text-xs text-danger">Retirer</button>
                )}
              </div>
            </Field>

            <Field label="Nom commercial">
              <input className="input" value={form.shop_name} disabled={!canEdit}
                     onChange={(e) => setForm({ ...form, shop_name: e.target.value })} />
            </Field>

            <Field label="Adresse">
              <input className="input" value={form.address_line1} disabled={!canEdit}
                     placeholder="N°, rue"
                     onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
            </Field>

            <Field label="Code postal & ville">
              <input className="input" value={form.address_zip_city} disabled={!canEdit}
                     placeholder="61000 Alençon"
                     onChange={(e) => setForm({ ...form, address_zip_city: e.target.value })} />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Téléphone">
                <input className="input" value={form.phone} disabled={!canEdit}
                       onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="SIRET">
                <input className="input" value={form.siret} disabled={!canEdit}
                       placeholder="14 chiffres" maxLength={14}
                       onChange={(e) => setForm({ ...form, siret: e.target.value })} />
              </Field>
              <Field label="N° TVA intra.">
                <input className="input" value={form.vat_number} disabled={!canEdit}
                       onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
              </Field>
            </div>

            <Field label="Site web (propre à cette boutique)">
              <input className="input" value={form.website} disabled={!canEdit}
                     placeholder="ex : plante-verte.fr"
                     onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
          </div>

          <div className="card p-5 space-y-4">
            <h2 className="font-semibold">Messages</h2>
            <Field label="Message de remerciement (tout en bas, 1 ligne)" help="Ex : « Merci de votre visite ». Imprimé en dernière ligne du ticket.">
              <input className="input" value={form.welcome_message} disabled={!canEdit}
                     onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} />
            </Field>
            <Field label="Message de pied de page" help="Affiché en bas, au-dessus du remerciement. Plusieurs lignes possibles.">
              <textarea className="input h-24" value={form.footer_message} disabled={!canEdit}
                        onChange={(e) => setForm({ ...form, footer_message: e.target.value })} />
            </Field>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Options d&apos;impression</h2>
            <Check label="Imprimer le code-barres du numéro de ticket (Code-128)"
                   checked={form.show_barcode} disabled={!canEdit}
                   onChange={(v) => setForm({ ...form, show_barcode: v })} />
            <Check label="Imprimer le détail de TVA"
                   checked={form.show_tax_breakdown} disabled={!canEdit}
                   onChange={(v) => setForm({ ...form, show_tax_breakdown: v })} />
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold">Impression automatique</h2>
            <p className="text-xs text-ink-soft">
              Nécessite qu&apos;une imprimante soit configurée dans{' '}
              <strong>Imprimante ticket (IP)</strong>. Sur iPad, l&apos;impression
              passe par AirPrint — utile aussi si vous avez ajouté l&apos;imprimante
              à votre Mac / PC en imprimante par défaut.
            </p>
            <Check label="Imprimer le ticket automatiquement après chaque vente"
                   checked={form.auto_print_receipt} disabled={!canEdit}
                   onChange={(v) => setForm({ ...form, auto_print_receipt: v })} />
            <Check label="Imprimer le Z automatiquement à la clôture journalière"
                   checked={form.auto_print_z} disabled={!canEdit}
                   onChange={(v) => setForm({ ...form, auto_print_z: v })} />
          </div>
        </div>

        {/* Prévisualisation */}
        <div className="lg:sticky lg:top-4 self-start">
          <div className="text-xs uppercase tracking-widest text-ink-soft font-semibold mb-2">Aperçu</div>
          <div className="rounded-2xl border border-border bg-white p-4 text-[11px] leading-tight" style={{ fontFamily: 'ui-monospace, monospace' }}>
            {form.logo_data_url && (
              <img src={form.logo_data_url} alt="" className="h-10 mx-auto mb-2" />
            )}
            <div className="text-center font-semibold text-sm">{form.shop_name || 'Nom commercial'}</div>
            {form.address_line1 && <div className="text-center">{form.address_line1}</div>}
            {form.address_zip_city && <div className="text-center">{form.address_zip_city}</div>}
            {form.phone && <div className="text-center">Tél : {form.phone}</div>}
            {form.siret && <div className="text-center">SIRET : {form.siret}</div>}
            {form.vat_number && <div className="text-center">TVA : {form.vat_number}</div>}
            {form.website && <div className="text-center">{form.website}</div>}
            <div className="border-t border-dashed border-ink my-2" />
            <div className="flex justify-between"><span>Bouquet rose</span><span>24,90 €</span></div>
            <div className="flex justify-between"><span>Carte cadeau</span><span>50,00 €</span></div>
            <div className="border-t border-dashed border-ink my-2" />
            <div className="flex justify-between font-semibold"><span>TOTAL TTC</span><span>74,90 €</span></div>
            {form.show_tax_breakdown && (
              <div className="mt-1 text-[10px]">
                <div className="flex justify-between"><span>TVA 20%</span><span>4,15 €</span></div>
              </div>
            )}
            {form.show_barcode && (
              <div className="mt-3 text-center">
                <div className="inline-block px-2 py-1 bg-ink/5">
                  <div className="font-mono text-[10px]">||||| ||||| | ||||</div>
                  <div className="text-[9px] mt-0.5">T-2026-000123</div>
                </div>
              </div>
            )}
            <div className="border-t border-dashed border-ink my-2" />
            <div className="text-center whitespace-pre-wrap">{form.footer_message}</div>
            {form.welcome_message && (
              <div className="text-center italic mt-1">{form.welcome_message}</div>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Paramètres enregistrés</div>}

      {canEdit && (
        <button onClick={() => void submit()} disabled={saving || loading || !storeId} className="btn-primary">
          {loading ? 'Chargement…' : saving ? 'Enregistrement…' : 'Enregistrer cette boutique'}
        </button>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
      {help && <p className="mt-1 text-xs text-ink-soft">{help}</p>}
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled}
             onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}
