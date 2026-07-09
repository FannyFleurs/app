'use client';

import { useRef, useState } from 'react';
import type { PlatformSettings } from '@/lib/settings/platform';

export default function PlatformConfigForm({ initial }: { initial: PlatformSettings }) {
  const [s, setS] = useState<PlatformSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch<K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('Logo trop volumineux (max 1 Mo). Compressez l\'image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => patch('logo_url', String(reader.result));
    reader.readAsDataURL(file);
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/admin/platform-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    setS(j.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
      {/* Branding */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Marque &amp; logo</h2>
        <div>
          <label className="text-sm font-medium text-ink-soft">Nom du logiciel</label>
          <input
            className="input mt-1"
            value={s.brand_name}
            onChange={(e) => patch('brand_name', e.target.value)}
            placeholder="HelloPos"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-ink-soft">Logo</label>
          <div className="mt-2 flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl border border-border bg-gray-50 grid place-items-center overflow-hidden shrink-0">
              {s.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={s.logo_url} alt="Logo" className="max-h-full max-w-full object-contain" />
                : <span className="text-ink-soft text-xl font-semibold">
                    {(s.brand_name || 'H').charAt(0)}
                  </span>}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onLogoFile}
                className="block text-sm"
              />
              <input
                className="input text-sm"
                value={s.logo_url.startsWith('data:') ? '' : s.logo_url}
                onChange={(e) => patch('logo_url', e.target.value)}
                placeholder="…ou collez une URL d'image (https://…)"
              />
              {s.logo_url && (
                <button
                  type="button"
                  onClick={() => { patch('logo_url', ''); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-xs text-danger hover:underline"
                >
                  Retirer le logo
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            PNG/SVG carré recommandé. Max 1 Mo. Le logo sera prêt à être
            affiché quand vous l&apos;aurez.
          </p>
        </div>
      </section>

      {/* Société éditrice */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Société éditrice</h2>
        <p className="text-xs text-ink-soft -mt-2">
          Ces informations s&apos;affichent sur le site vitrine (pied de page,
          mentions légales, contact).
        </p>
        <div>
          <label className="text-sm font-medium text-ink-soft">Raison sociale</label>
          <input className="input mt-1" value={s.company_legal_name}
                 onChange={(e) => patch('company_legal_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">SIREN</label>
            <input className="input mt-1" value={s.company_siren}
                   onChange={(e) => patch('company_siren', e.target.value.replace(/\s/g, ''))} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">SIRET</label>
            <input className="input mt-1" value={s.company_siret}
                   onChange={(e) => patch('company_siret', e.target.value.replace(/\s/g, ''))} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">N° TVA</label>
            <input className="input mt-1" value={s.company_vat}
                   onChange={(e) => patch('company_vat', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-ink-soft">Adresse</label>
          <input className="input mt-1" value={s.address_line1}
                 onChange={(e) => patch('address_line1', e.target.value)} placeholder="N°, rue" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Code postal</label>
            <input className="input mt-1" value={s.address_zip}
                   onChange={(e) => patch('address_zip', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-ink-soft">Ville</label>
            <input className="input mt-1" value={s.address_city}
                   onChange={(e) => patch('address_city', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-ink-soft">Pays</label>
          <input className="input mt-1" value={s.address_country}
                 onChange={(e) => patch('address_country', e.target.value)} />
        </div>
      </section>

      {/* Contact */}
      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Contact public</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input className="input mt-1" type="email" value={s.contact_email}
                   onChange={(e) => patch('contact_email', e.target.value)} placeholder="contact@…" />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Téléphone</label>
            <input className="input mt-1" value={s.contact_phone}
                   onChange={(e) => patch('contact_phone', e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-ink-soft">Site web</label>
          <input className="input mt-1" value={s.website}
                 onChange={(e) => patch('website', e.target.value)} placeholder="https://…" />
        </div>
      </section>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Configuration enregistrée</div>}

      <div className="flex justify-end">
        <button onClick={() => void submit()} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
