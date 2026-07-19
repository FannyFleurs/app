'use client';

import { useRef, useState } from 'react';
import { ImageField, SaveBar, fileToDataUrl, savePlatformConfig } from './_shared';

type BrandingData = {
  brand_name: string;
  logo_url: string;
  favicon_url: string;
  bo_favicon_url: string;
  admin_favicon_url: string;
  ca_logo_url: string;
  ca_favicon_url: string;
  login_image_url: string;
};

const KEYS: (keyof BrandingData)[] = [
  'brand_name', 'logo_url', 'favicon_url', 'bo_favicon_url', 'admin_favicon_url',
  'ca_logo_url', 'ca_favicon_url', 'login_image_url',
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
    // On ne conserve que les clés de branding depuis la réponse.
    const next = { ...s };
    for (const k of KEYS) if (res.settings[k] !== undefined) (next as Record<string, unknown>)[k] = res.settings[k];
    setS(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5">
      <div className="lg:columns-2 lg:gap-5 [&>section]:mb-5 [&>section]:break-inside-avoid space-y-5 lg:space-y-0">
        {/* Marque + logo + favicon principal + visuel connexion */}
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

        {/* Favicons par espace (BO / admin) */}
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Favicons par espace</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Icône d'onglet distincte pour chaque espace. Vide = le favicon
              principal (puis le logo) est utilisé.
            </p>
          </div>
          <ImageField
            label="Favicon Back-office (bo.)"
            hint="Onglet du navigateur dans le back-office. Vide = favicon principal."
            value={s.bo_favicon_url}
            onFile={(e) => onImageFile(e, 'bo_favicon_url')}
            onUrl={(v) => patch('bo_favicon_url', v)}
            onClear={() => patch('bo_favicon_url', '')}
          />
          <ImageField
            label="Favicon Admin SaaS (admin.)"
            hint="Onglet du navigateur dans la console super-admin. Vide = favicon principal."
            value={s.admin_favicon_url}
            onFile={(e) => onImageFile(e, 'admin_favicon_url')}
            onUrl={(v) => patch('admin_favicon_url', v)}
            onClear={() => patch('admin_favicon_url', '')}
          />
        </section>

        {/* Espace CA (logo + favicon distincts) */}
        <section className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold">Espace CA (suivi du chiffre d&apos;affaires)</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Logo et favicon distincts pour le sous-domaine <code>ca.</code>
              Vides = le logo principal est utilisé.
            </p>
          </div>
          <ImageField
            label="Logo CA"
            hint="Affiché sur l'espace CA."
            value={s.ca_logo_url}
            onFile={(e) => onImageFile(e, 'ca_logo_url')}
            onUrl={(v) => patch('ca_logo_url', v)}
            onClear={() => patch('ca_logo_url', '')}
          />
          <ImageField
            label="Favicon CA"
            hint="Onglet du navigateur sur ca. Vide = le logo CA est utilisé."
            value={s.ca_favicon_url}
            onFile={(e) => onImageFile(e, 'ca_favicon_url')}
            onUrl={(v) => patch('ca_favicon_url', v)}
            onClear={() => patch('ca_favicon_url', '')}
          />
        </section>
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={() => void submit()} />
    </div>
  );
}
