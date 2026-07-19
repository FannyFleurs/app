'use client';

/**
 * Briques partagées par les sous-pages de configuration plateforme
 * (Marque & logos / Société / Facturation).
 */

/** Lit un fichier image et le convertit en data URL (base64). */
export function fileToDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Image trop volumineuse (max ${Math.round(maxBytes / 1_000_000)} Mo). Compressez le fichier.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

/** Enregistre un sous-ensemble de la config plateforme (PATCH partiel). */
export async function savePlatformConfig(
  payload: Record<string, unknown>,
): Promise<{ ok: true; settings: Record<string, unknown> } | { ok: false; error: string }> {
  const r = await fetch('/api/admin/platform-config', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: j.message ?? j.error ?? 'Erreur' };
  }
  const j = await r.json();
  return { ok: true, settings: j.settings };
}

/** Champ d'image réutilisable : aperçu + upload fichier + URL + effacer. */
export function ImageField({ label, hint, value, onFile, onUrl, onClear }: {
  label: string; hint: string; value: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrl: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl border border-border bg-gray-50 grid place-items-center overflow-hidden shrink-0">
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
            : <span className="text-ink-soft text-xs">—</span>}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input type="file" accept="image/*" onChange={onFile} className="block w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium" />
          <input
            className="input text-sm"
            value={value.startsWith('data:') ? '' : value}
            onChange={(e) => onUrl(e.target.value)}
            placeholder="…ou collez une URL (https://…)"
          />
          {value && (
            <button type="button" onClick={onClear} className="text-xs text-danger hover:underline">
              Retirer
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </div>
  );
}

/** Bandeau de statut enregistrement (erreur / succès). */
export function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string | null; onSave: () => void;
}) {
  return (
    <>
      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Configuration enregistrée</div>}
      <div className="flex justify-end">
        <button onClick={onSave} disabled={saving} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}
