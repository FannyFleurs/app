'use client';

import { useRef, useState } from 'react';
import { ImageField, SaveBar, fileToDataUrl, savePlatformConfig } from './_shared';

type BrandingData = {
  brand_name: string;
  logo_url: string;
  favicon_url: string;
  login_image_url: string;
  bo_logo_url: string;
  bo_favicon_url: string;
  admin_logo_url: string;
  admin_favicon_url: string;
  pda_logo_url: string;
  pda_favicon_url: string;
  ca_logo_url: string;
  ca_favicon_url: string;
};

const KEYS: (keyof BrandingData)[] = [
  'brand_name', 'logo_url', 'favicon_url', 'login_image_url',
  'bo_logo_url', 'bo_favicon_url', 'admin_logo_url', 'admin_favicon_url',
  'pda_logo_url', 'pda_favicon_url', 'ca_logo_url', 'ca_favicon_url',
];

export default function BrandingForm({ initial }: { initial: BrandingData }) {
  const [s, setS] = useState<BrandingData>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch<K extends keyof BrandingData>(k: K, v: BrandingData[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>, key: keyof BrandingData, maxBytes = 1_000_000) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    fileToDataUrl(file, maxBytes)
      .then((url) => patch(key, url))
      .catch((err: Error) => setError(err.message));
  }

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const payload: Record<string, unknown> = {};
    for (const k of KEYS) payload[k] = s[k];
    const res = await savePlatformConfig(payload);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    const next = { ...s };
    for (const k of KEYS) if (res.settings[k] !== undefined) (next as Record<string, unknown>)[k] = res.settings[k];
    setS(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // Bloc d'un espace : titre (nom de la page) + logo + favicon dans le même bloc.
  function SpaceBlock({ title, sub, logoKey, favKey }: {
    title: string; sub: string;
    logoKey: keyof BrandingData; favKey: keyof BrandingData;
  }) {
    return (
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-ink-soft">{sub}</p>
        </div>
        <ImageField
          label="Logo"
          hint="Affiché dans cet espace. Vide = le logo principal."
          value={s[logoKey]}
          onFile={(e) => onImageFile(e, logoKey)}
          onUrl={(v) => patch(logoKey, v)}
          onClear={() => patch(logoKey, '')}
        />
        <ImageField
          label="Favicon"
          hint="Onglet du navigateur. Vide = le favicon (puis le logo) est utilisé."
          value={s[favKey]}
          onFile={(e) => onImageFile(e, favKey)}
          onUrl={(v) => patch(favKey, v)}
          onClear={() => patch(favKey, '')}
        />
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="lg:columns-2 lg:gap-5 [&>section]:mb-5 [&>section]:break-inside-avoid space-y-5 lg:space-y-0">
        {/* Marque & logo — inchangé */}
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
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => onImageFile(e, 'logo_url')}
                  className="block w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium"
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
            <p className="mt-1 text-xs text-ink-soft">PNG/SVG carré recommandé. Max 1 Mo.</p>
          </div>

          <ImageField
            label="Favicon principal (caisse / app)"
            hint="Icône affichée dans l'onglet du navigateur. Vide = le logo est utilisé."
            value={s.favicon_url}
            onFile={(e) => onImageFile(e, 'favicon_url')}
            onUrl={(v) => patch('favicon_url', v)}
            onClear={() => patch('favicon_url', '')}
          />
          <ImageField
            label="Visuel écran de connexion (caisse)"
            hint="Photo affichée à droite de l'écran de connexion de la caisse (max 3 Mo). Vide = le logo / visuel par défaut."
            value={s.login_image_url}
            onFile={(e) => onImageFile(e, 'login_image_url', 3_000_000)}
            onUrl={(v) => patch('login_image_url', v)}
            onClear={() => patch('login_image_url', '')}
          />
        </section>

        {/* Un bloc par espace : logo + favicon, titré par le nom de la page. */}
        <SpaceBlock title="Back-office" sub="Sous-domaine bo. Vides = branding principal."
                    logoKey="bo_logo_url" favKey="bo_favicon_url" />
        <SpaceBlock title="Console admin (SaaS)" sub="Sous-domaine admin. Vides = branding principal."
                    logoKey="admin_logo_url" favKey="admin_favicon_url" />
        <SpaceBlock title="PDA (étiquettes)" sub="Sous-domaine pda. Vides = branding principal."
                    logoKey="pda_logo_url" favKey="pda_favicon_url" />
        <SpaceBlock title="Espace CA" sub="Sous-domaine ca. (suivi du chiffre d'affaires). Vides = branding principal."
                    logoKey="ca_logo_url" favKey="ca_favicon_url" />
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={() => void submit()} />
    </div>
  );
}
