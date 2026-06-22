'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import { useRouter } from 'next/navigation';
import {
  POS_TILE_SIZES,
  POS_TILE_SIZE_LABELS,
  POS_THEME_COLORS,
  POS_THEME_COLOR_VALUES,
  POS_UI_DEFAULTS,
  tileMetrics,
  type PosUiSettings,
  type PosTileSize,
  type PosThemeColor,
} from '@/lib/settings/pos-ui';
import Badge from '@/components/Badge';

interface Props {
  initial: PosUiSettings;
  canWrite: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function POSSettingsForm({ initial, canWrite }: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState<PosUiSettings>(initial);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);
  const lastSaved = useRef<PosUiSettings>(initial);

  // Aperçu en direct du thème : surcharge le data-theme du body pendant l'édition
  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme_color);
  }, [settings.theme_color]);

  // Auto-save (debounce 400ms) à chaque changement.
  useEffect(() => {
    if (!canWrite) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Évite de sauvegarder si pas de changement effectif
    if (JSON.stringify(settings) === JSON.stringify(lastSaved.current)) return;

    const t = setTimeout(async () => {
      setSaveState('saving');
      setError(null);
      try {
        const res = await fetch('/api/settings/pos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? 'Sauvegarde impossible');
          setSaveState('error');
          return;
        }
        const j = await res.json();
        lastSaved.current = j.settings;
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1500);
        // Rafraîchit la page pour que le layout serveur recharge le thème pour tous les composants
        router.refresh();
      } catch {
        setError('Réseau indisponible');
        setSaveState('error');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [settings, canWrite]);

  function patch<K extends keyof PosUiSettings>(key: K, value: PosUiSettings[K]) {
    if (!canWrite) return;
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function reset() {
    if (!canWrite) return;
    setSettings({ ...POS_UI_DEFAULTS });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Colonne gauche : sections de réglages */}
      <div className="lg:col-span-2 space-y-5">
        <Section
          title="Couleur des boutons"
          description="Couleur principale appliquée aux boutons d'action et accents. Modifiable à tout moment."
        >
          <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
            {POS_THEME_COLORS.map((color) => {
              const meta = POS_THEME_COLOR_VALUES[color];
              const active = settings.theme_color === color;
              return (
                <button
                  key={color}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => patch('theme_color', color)}
                  className={`relative rounded-2xl border p-3 transition-all flex flex-col items-center gap-2
                    ${active ? 'border-ink ring-2 ring-offset-1' : 'border-border hover:border-gray-300'}
                    ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                  style={{ ['--tw-ring-color' as string]: meta.main }}
                  title={meta.label}
                >
                  <div className="h-10 w-10 rounded-full shadow-sm" style={{ background: meta.main }} />
                  <span className="text-xs font-medium leading-tight text-center">{meta.label}</span>
                  {active && <span className="absolute top-1.5 right-2 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          title="Apparence des tuiles produit"
          description="Taille des cartes affichées sur la grille produits de la caisse."
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POS_TILE_SIZES.map((size) => {
              const meta = POS_TILE_SIZE_LABELS[size];
              const active = settings.tile_size === size;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => patch('tile_size', size)}
                  className={`text-left rounded-2xl border p-4 transition-all
                    ${active ? 'border-sage bg-sage-soft ring-2 ring-sage/30'
                            : 'border-border bg-white hover:border-sage/40'}
                    ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{meta.label}</span>
                    <SizeIcon size={size} />
                  </div>
                  <p className="mt-1 text-xs text-ink-soft leading-snug">{meta.description}</p>
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          title="Affichage du contenu"
          description="Éléments visibles sur chaque tuile produit."
        >
          <div className="space-y-2">
            <Toggle
              label="Afficher le prix sur la tuile"
              checked={settings.show_price}
              onChange={(v) => patch('show_price', v)}
              disabled={!canWrite}
            />
            <Toggle
              label="Afficher le badge de TVA"
              checked={settings.show_tax_badge}
              onChange={(v) => patch('show_tax_badge', v)}
              disabled={!canWrite}
            />
            <Toggle
              label="Afficher le nom de la catégorie sous le produit"
              checked={settings.show_category_badge}
              onChange={(v) => patch('show_category_badge', v)}
              disabled={!canWrite}
            />
            <Toggle
              label="Afficher l'image du produit (si disponible)"
              checked={settings.show_product_image}
              onChange={(v) => patch('show_product_image', v)}
              disabled={!canWrite}
            />
          </div>
        </Section>

        {/* Sections futures — stubs visibles pour montrer l'extensibilité */}
        <Section
          title="Comportement"
          description="Bientôt : verrouillage automatique, raccourcis clavier, scan auto."
          disabled
        >
          <div className="text-sm text-ink-soft">À venir — Phase 2.</div>
        </Section>

        <Section
          title="Périphériques"
          description="Bientôt : imprimante ticket, tiroir-caisse, scanner, afficheur client."
          disabled
        >
          <div className="text-sm text-ink-soft">À venir — Phase 4.</div>
        </Section>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-xs text-ink-soft min-h-[1.25rem]">
            {saveState === 'saving' && <span>Enregistrement…</span>}
            {saveState === 'saved' && <span className="text-success">✓ Enregistré</span>}
            {saveState === 'error' && <span className="text-danger">⚠ {error}</span>}
            {saveState === 'idle' && canWrite && <span>Modifications enregistrées automatiquement.</span>}
            {!canWrite && <span>Demandez à un manager pour modifier.</span>}
          </div>
          {canWrite && (
            <button onClick={reset} className="btn-ghost text-sm">
              Réinitialiser aux valeurs par défaut
            </button>
          )}
        </div>
      </div>

      {/* Colonne droite : aperçu */}
      <div>
        <div className="sticky top-6 space-y-3">
          <div className="text-xs uppercase tracking-wider text-ink-soft font-semibold px-1">
            Aperçu en direct
          </div>
          <PreviewGrid settings={settings} />
          <p className="text-xs text-ink-soft px-1">
            L&apos;aperçu reflète vos choix. La grille s&apos;adapte automatiquement à la
            largeur de l&apos;écran sur la vraie caisse.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children, disabled }: {
  title: string; description?: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <section className={`card p-5 ${disabled ? 'opacity-60' : ''}`}>
      <header className="mb-3">
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="text-sm text-ink-soft mt-0.5">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 py-2 border-b border-border/60 last:border-0 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="text-sm">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-sage' : 'bg-border'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}

function SizeIcon({ size }: { size: PosTileSize }) {
  const cells = {
    compact: 6, normal: 4, large: 3, xl: 2,
  }[size];
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="h-4 w-1.5 rounded-sm bg-sage/40" />
      ))}
    </div>
  );
}

const PREVIEW_PRODUCTS = [
  { name: 'Bouquet rond du jour', price: 28, tax: 10, category: 'Bouquets' },
  { name: 'Composition piquée', price: 55, tax: 10, category: 'Compositions' },
  { name: 'Cache-pot émaillé Ø17', price: 24, tax: 20, category: 'Cache-pots' },
  { name: 'Bougie soja vanille', price: 18, tax: 20, category: 'Bougies' },
];

function PreviewGrid({ settings }: { settings: PosUiSettings }) {
  const m = tileMetrics(settings.tile_size);
  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <div className={`grid ${m.grid} ${m.gap}`}>
        {PREVIEW_PRODUCTS.map((p) => (
          <div
            key={p.name}
            className={`card ${m.padding} text-left`}
          >
            {settings.show_product_image && (
              <div className="mb-2 h-14 w-full rounded-lg bg-sage-soft grid place-items-center text-sage-deep">
                ✿
              </div>
            )}
            <div className={`${m.titleFontSize} ${m.titleMinHeight} font-medium line-clamp-2 leading-tight`}>
              {p.name}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {settings.show_price && (
                <span className={`${m.priceFontSize} font-semibold`}>{formatEUR(p.price)}</span>
              )}
              {settings.show_tax_badge && (
                <Badge tone="soft">{p.tax}%</Badge>
              )}
            </div>
            {settings.show_category_badge && (
              <div className="mt-1 text-[11px] text-ink-soft truncate">{p.category}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
