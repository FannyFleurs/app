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
  OPENING_FLOAT_MODES,
  OPENING_FLOAT_LABELS,
  COLOR_SCHEMES,
  tileMetrics,
  type PosUiSettings,
  type PosTileSize,
  type PosThemeColor,
  type ColorScheme,
  type OpeningFloatMode,
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

  // Aperçu en direct du thème + mode clair/sombre pendant l'édition
  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme_color);
  }, [settings.theme_color]);
  useEffect(() => {
    let mode: 'light' | 'dark' = 'light';
    if (settings.color_scheme === 'dark') mode = 'dark';
    else if (settings.color_scheme === 'system') {
      mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.body.setAttribute('data-mode', mode);
  }, [settings.color_scheme]);

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
          title="Mode d'affichage"
          description="Clair, sombre, ou suit le mode du système."
        >
          <div className="grid grid-cols-3 gap-3">
            {COLOR_SCHEMES.map((scheme) => {
              const active = settings.color_scheme === scheme;
              const label = scheme === 'light' ? 'Clair' : scheme === 'dark' ? 'Sombre' : 'Système';
              return (
                <button
                  key={scheme}
                  type="button"
                  disabled={!canWrite}
                  onClick={() => patch('color_scheme', scheme)}
                  className={`rounded-2xl border p-4 transition-all
                    ${active ? 'border-ink ring-2 ring-offset-1' : 'border-border hover:border-gray-300'}
                    ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="text-2xl mb-1">{scheme === 'light' ? '☀' : scheme === 'dark' ? '☾' : '✦'}</div>
                  <div className="font-medium text-sm">{label}</div>
                </button>
              );
            })}
          </div>
        </Section>

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

        <Section
          title="Déconnexion automatique"
          description="Comportement de fermeture de la session utilisateur."
        >
          <div className="space-y-2">
            {[
              { value: 'never', label: 'Jamais', desc: 'L\'utilisateur reste connecté tant qu\'il ne se déconnecte pas manuellement.' },
              { value: 'after_sale', label: 'Après chaque vente', desc: 'Renvoie sur l\'écran de connexion après chaque ticket validé.' },
              { value: 'timer', label: 'Après inactivité', desc: 'Déconnexion auto après X minutes sans action.' },
            ].map((opt) => (
              <label key={opt.value}
                     className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                       settings.auto_logout_mode === opt.value ? 'border-ink bg-accent-soft' : 'border-border bg-white'
                     } ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <input
                  type="radio" name="auto_logout_mode" value={opt.value}
                  checked={settings.auto_logout_mode === opt.value}
                  onChange={() => patch('auto_logout_mode', opt.value as typeof settings.auto_logout_mode)}
                  disabled={!canWrite}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-ink-soft mt-0.5">{opt.desc}</div>
                </div>
              </label>
            ))}
            {settings.auto_logout_mode === 'timer' && (
              <div className="rounded-xl border border-border bg-white p-3 ml-7">
                <label className="text-xs font-medium text-ink-soft">Délai d&apos;inactivité (minutes)</label>
                <input
                  type="number" min={1} max={120}
                  className="input mt-1 max-w-[120px]"
                  value={settings.auto_logout_minutes}
                  onChange={(e) => patch('auto_logout_minutes', Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
                  disabled={!canWrite}
                />
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Ouverture de la caisse"
          description="Comment pré-remplir le fond de caisse à l'ouverture chaque matin."
        >
          <div className="space-y-2">
            {OPENING_FLOAT_MODES.map((mode) => {
              const meta = OPENING_FLOAT_LABELS[mode];
              const active = settings.opening_float_mode === mode;
              return (
                <label
                  key={mode}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-all ${
                    active ? 'border-ink bg-accent-soft' : 'border-border bg-white hover:border-gray-300'
                  } ${!canWrite ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="opening_float_mode"
                    value={mode}
                    checked={active}
                    onChange={() => patch('opening_float_mode', mode)}
                    disabled={!canWrite}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{meta.label}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{meta.description}</div>
                  </div>
                </label>
              );
            })}

            {settings.opening_float_mode === 'fixed' && (
              <div className="rounded-xl border border-border bg-white p-3 ml-7 mt-2">
                <label className="text-xs font-medium text-ink-soft">Montant du fond fixe (€)</label>
                <input
                  type="number" step="0.01" min={0}
                  className="input mt-1 max-w-xs"
                  value={settings.opening_float_amount}
                  onChange={(e) => patch('opening_float_amount', Number(e.target.value || 0))}
                  disabled={!canWrite}
                />
                <p className="mt-1 text-xs text-ink-soft">
                  Aperçu : {formatEUR(settings.opening_float_amount)}
                </p>
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Programme de fidélité"
          description="Les remises de fidélité se déclenchent depuis la fiche client en caisse une fois le seuil atteint."
        >
          <label className="flex items-center justify-between gap-3 py-2 border-b border-border/60">
            <span className="text-sm font-medium">Programme activé</span>
            <input
              type="checkbox" className="h-5 w-5"
              checked={settings.loyalty.enabled}
              disabled={!canWrite}
              onChange={(e) => patch('loyalty', { ...settings.loyalty, enabled: e.target.checked })}
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-soft">€ de fidélité gagnés</label>
              <input type="number" step="0.5" min={0}
                     className="input mt-1"
                     value={settings.loyalty.euros_earned}
                     disabled={!canWrite || !settings.loyalty.enabled}
                     onChange={(e) => patch('loyalty', { ...settings.loyalty, euros_earned: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">… tous les € dépensés</label>
              <input type="number" step="1" min={1}
                     className="input mt-1"
                     value={settings.loyalty.per_euros_spent}
                     disabled={!canWrite || !settings.loyalty.enabled}
                     onChange={(e) => patch('loyalty', { ...settings.loyalty, per_euros_spent: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Seuil d&apos;utilisation minimum (€)</label>
              <input type="number" step="0.5" min={0}
                     className="input mt-1"
                     value={settings.loyalty.min_redeem}
                     disabled={!canWrite || !settings.loyalty.enabled}
                     onChange={(e) => patch('loyalty', { ...settings.loyalty, min_redeem: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox"
                       checked={settings.loyalty.stackable}
                       disabled={!canWrite || !settings.loyalty.enabled}
                       onChange={(e) => patch('loyalty', { ...settings.loyalty, stackable: e.target.checked })} />
                Cumulable avec d&apos;autres remises
              </label>
            </div>
          </div>
          {settings.loyalty.enabled && (
            <p className="mt-3 text-xs text-ink-soft">
              Règle actuelle : {settings.loyalty.euros_earned} € de fidélité gagnés tous les{' '}
              {settings.loyalty.per_euros_spent} € dépensés. Utilisable à partir de{' '}
              {settings.loyalty.min_redeem} € cumulés.
              {settings.loyalty.stackable ? ' Cumulable avec d\'autres remises.' : ' Non cumulable avec une autre remise.'}
            </p>
          )}
        </Section>

        <Section
          title="Modes de règlement"
          description="Activer/désactiver et libellés des moyens de paiement disponibles en caisse."
        >
          <PaymentMethodsManager canWrite={canWrite} />
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

interface PaymentMethod {
  id: string;
  code: string;
  kind: string;
  label: string;
  is_active: boolean;
  position: number;
}

const PM_KIND_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte bancaire' },
  { value: 'check', label: 'Chèque' },
  { value: 'transfer', label: 'Virement' },
  { value: 'gift_card', label: 'Carte cadeau' },
  { value: 'credit_note', label: 'Avoir' },
  { value: 'deferred', label: 'Différé client' },
  { value: 'other', label: 'Autre' },
];

function PaymentMethodsManager({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [newKind, setNewKind] = useState('other');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/payment-methods');
    if (r.ok) setItems((await r.json()).methods);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(id: string, is_active: boolean) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    });
    void load();
  }
  async function rename(id: string, label: string) {
    await fetch(`/api/payment-methods/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    void load();
  }
  async function add() {
    if (!newLabel.trim()) return;
    await fetch('/api/payment-methods', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim(), kind: newKind }),
    });
    setNewLabel('');
    void load();
  }

  return (
    <div>
      {loading ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
              <span className="text-xs uppercase tracking-wider w-20 text-ink-soft">{m.kind}</span>
              <input
                className="input h-9 flex-1"
                defaultValue={m.label}
                disabled={!canWrite}
                onBlur={(e) => e.target.value !== m.label && void rename(m.id, e.target.value)}
              />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={m.is_active}
                       disabled={!canWrite}
                       onChange={(e) => void toggle(m.id, e.target.checked)} />
                Actif
              </label>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="mt-3 flex items-center gap-2">
          <input className="input h-9 flex-1" placeholder="Nouveau libellé"
                 value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <select className="input h-9 max-w-[160px]" value={newKind}
                  onChange={(e) => setNewKind(e.target.value)}>
            {PM_KIND_OPTIONS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <button className="btn-soft text-sm" onClick={() => void add()} disabled={!newLabel.trim()}>
            + Ajouter
          </button>
        </div>
      )}
    </div>
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
