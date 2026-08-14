'use client';

import { useState } from 'react';
import { SaveBar, savePlatformConfig } from './_shared';

type SocieteData = {
  company_legal_name: string;
  company_siren: string;
  company_siret: string;
  company_vat: string;
  address_line1: string;
  address_zip: string;
  address_city: string;
  address_country: string;
  contact_email: string;
  contact_phone: string;
  website: string;
  demo_video_url: string;
};

const KEYS = Object.keys({
  company_legal_name: '', company_siren: '', company_siret: '', company_vat: '',
  address_line1: '', address_zip: '', address_city: '', address_country: '',
  contact_email: '', contact_phone: '', website: '', demo_video_url: '',
} as SocieteData) as (keyof SocieteData)[];

export default function SocieteForm({ initial }: { initial: SocieteData }) {
  const [s, setS] = useState<SocieteData>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch<K extends keyof SocieteData>(k: K, v: SocieteData[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const payload: Record<string, unknown> = {};
    for (const k of KEYS) payload[k] = s[k];
    const res = await savePlatformConfig(payload);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Contact public</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold">Site vitrine</h2>
        <div>
          <label className="text-sm font-medium text-ink-soft">Vidéo de démonstration</label>
          <input className="input mt-1" value={s.demo_video_url}
                 onChange={(e) => patch('demo_video_url', e.target.value)}
                 placeholder="https://www.youtube.com/watch?v=… ou lien Loom / .mp4" />
          <p className="text-xs text-ink-soft mt-1">
            Collez un lien YouTube, Vimeo, Loom ou un fichier .mp4. Un encart vidéo
            apparaît alors sur la page d&apos;accueil. Laissez vide pour ne rien afficher.
          </p>
        </div>
      </section>

      <SaveBar saving={saving} saved={saved} error={error} onSave={() => void submit()} />
    </div>
  );
}
