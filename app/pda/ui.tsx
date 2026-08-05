'use client';

import type { ReactNode } from 'react';
import type { ScanFieldApi } from './scan';

/**
 * Briques d'interface communes aux écrans du PDA.
 *
 * Contraintes propres à l'appareil : écran étroit, utilisation au doigt et
 * souvent d'une seule main, gants possibles. Toutes les cibles tactiles font
 * donc au minimum 44 px, et chaque écran tient sur une hauteur fixe avec une
 * seule zone défilante — jamais la page entière.
 *
 * Les couleurs sont données en clair (variables CSS ou hexadécimal) et non en
 * classes Tailwind construites dynamiquement : une classe absente du CSS final
 * rend l'élément invisible sans lever d'erreur.
 */

/** Teinte d'accent d'un module, reprise sur sa tuile et son en-tête. */
export const MODULE_TONES = {
  stock:     { bg: '#E8EFF7', fg: '#1F4E79' },
  labels:    { bg: '#E6F1E9', fg: '#2F6B3F' },
  inventory: { bg: '#EFE9F6', fg: '#5B4A86' },
  settings:  { bg: '#FBEEE2', fg: '#96581B' },
} as const;
export type ModuleTone = keyof typeof MODULE_TONES;

/* ------------------------------------------------------------------ écrans */

/** Écran plein : hauteur fixe, encoches respectées, aucun défilement global. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      className="h-[100dvh] flex flex-col bg-bg text-ink overflow-hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {children}
    </div>
  );
}

/** En-tête : retour, titre, accueil. Le titre reste centré quoi qu'il arrive. */
export function Header({ title, onBack, onHome }: {
  title: string;
  onBack?: () => void;
  onHome?: () => void;
}) {
  return (
    <header
      className="shrink-0 flex items-center gap-1 px-1.5 text-white"
      style={{
        backgroundColor: 'var(--primary-deep, #3C513D)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        minHeight: 'calc(3.25rem + env(safe-area-inset-top, 0px))',
      }}
    >
      <div className="w-11 shrink-0">
        {onBack && (
          <button onClick={onBack} aria-label="Retour"
                  className="h-11 w-11 grid place-items-center active:opacity-60">
            <IconArrowLeft />
          </button>
        )}
      </div>
      <h1 className="flex-1 text-center text-[17px] font-semibold truncate">{title}</h1>
      <div className="w-11 shrink-0">
        {onHome && (
          <button onClick={onHome} aria-label="Accueil"
                  className="h-11 w-11 grid place-items-center active:opacity-60">
            <IconHome />
          </button>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ accueil */

/** Tuile du menu d'accueil : icône teintée, titre, sous-titre, chevron. */
export function MenuCard({ tone, icon, title, subtitle, onClick, disabled }: {
  tone: ModuleTone;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = MODULE_TONES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="card w-full flex items-center gap-3 p-3 text-left active:scale-[0.99] transition-transform disabled:opacity-40"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: t.bg, color: t.fg }}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-tight truncate">{title}</span>
        <span className="block text-xs text-ink-soft leading-snug">{subtitle}</span>
      </span>
      <span className="shrink-0 text-ink-soft"><IconChevron /></span>
    </button>
  );
}

/* -------------------------------------------------------------------- onglets */

export function Tabs<T extends string>({ value, onChange, items }: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="shrink-0 flex border-b border-border bg-surface">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={`flex-1 h-12 text-sm font-medium border-b-2 transition-colors ${
              active ? 'text-ink' : 'text-ink-soft border-transparent'
            }`}
            style={active ? { borderColor: 'var(--primary)' } : undefined}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- champ scan */

/**
 * Champ de scan / recherche.
 *
 * Il est NON contrôlé : la douchette écrit directement dans le DOM, sans
 * dépendre d'un cycle de rendu React. La touche Entrée n'est pas traitée ici —
 * elle appartient au moteur de scan global (voir `scan.ts`), ce qui évite
 * qu'un code soit soumis deux fois par deux chemins différents.
 *
 * `onSearch` ne sert qu'à filtrer une liste affichée : aucune action
 * automatique n'est jamais déclenchée à partir de ce filtre.
 */
export function ScanField({ field, placeholder, onCamera, showClear }: {
  field: ScanFieldApi;
  placeholder?: string;
  onCamera?: () => void;
  showClear?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: field.armed ? 'var(--primary)' : undefined }}>
            <IconBarcode />
          </span>
          <input
            ref={field.inputRef}
            {...field.bind}
            type="text"
            // En mode scan, on n'ouvre pas le clavier logiciel : il masquerait
            // la moitié de l'écran sans servir. Toucher le champ bascule en
            // saisie manuelle et le fait apparaître.
            inputMode={field.manual ? 'text' : 'none'}
            enterKeyHint="done"
            className={`input h-12 w-full pl-10 text-base ${showClear ? 'pr-11' : 'pr-3'}`}
            style={field.armed ? { borderColor: 'var(--primary)' } : undefined}
            placeholder={placeholder ?? 'Scanner ou rechercher…'}
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            autoFocus
          />
          {showClear && (
            <button
              type="button"
              aria-label="Effacer"
              onClick={() => { field.clear(); field.focus(); }}
              className="absolute right-1 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full text-ink-soft active:bg-gray-100"
            >
              <span aria-hidden className="text-xl leading-none">×</span>
            </button>
          )}
        </div>
        {onCamera && (
          <button onClick={onCamera} aria-label="Scanner avec la caméra"
                  className="h-12 w-12 shrink-0 grid place-items-center rounded-xl border border-border bg-surface active:bg-gray-100">
            <IconScanFrame />
          </button>
        )}
      </div>
      {/* Le navigateur refuse le focus automatique hors interaction : tant que
          le champ n'est pas armé, le lecteur intégré n'a nulle part où écrire. */}
      {!field.armed && (
        <button
          onClick={() => field.focus()}
          className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-xs font-medium text-left"
          style={{ backgroundColor: 'rgba(183,121,31,0.10)', color: '#96581B' }}
        >
          ⚠ Touchez le champ pour activer le scan
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ éléments */

/** Bloc « article reconnu » : pastille, nom, référence, complément. */
export function ProductCard({ name, reference, extra, right }: {
  name: string;
  reference?: string | null;
  extra?: string | null;
  right?: ReactNode;
}) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gray-100 text-ink-soft">
        <IconBox />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight truncate">{name}</div>
        {reference && <div className="text-xs text-ink-soft truncate">Réf. : {reference}</div>}
        {extra && <div className="text-xs text-ink-soft truncate">{extra}</div>}
      </div>
      {right}
    </div>
  );
}

/** Compteur − valeur + . La valeur se touche pour une saisie au clavier. */
export function Stepper({ value, onChange, onEdit, min = 0, max = 9999 }: {
  value: number;
  onChange: (v: number) => void;
  onEdit?: () => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-stretch rounded-xl border border-border overflow-hidden bg-surface">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Diminuer"
        className="h-12 w-14 grid place-items-center text-2xl leading-none text-ink-soft active:bg-gray-100 disabled:opacity-30"
      >−</button>
      <button
        onClick={onEdit}
        disabled={!onEdit}
        className="flex-1 min-w-[3.5rem] grid place-items-center text-xl font-semibold tabular-nums border-x border-border disabled:opacity-100"
      >{value}</button>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Augmenter"
        className="h-12 w-14 grid place-items-center text-2xl leading-none text-ink-soft active:bg-gray-100 disabled:opacity-30"
      >+</button>
    </div>
  );
}

/** Ligne d'information d'un tableau de synthèse. */
export function InfoRow({ label, value, tone }: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'danger' | 'success';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${
        tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : ''
      }`}>{value}</span>
    </div>
  );
}

/** Bandeau de retour d'action, en bas d'écran, non bloquant. */
export function Toast({ message, tone = 'ok' }: { message: string; tone?: 'ok' | 'error' }) {
  return (
    <div
      className="mx-3 mb-2 shrink-0 rounded-xl px-3 py-2 text-sm font-medium"
      style={tone === 'error'
        ? { backgroundColor: 'rgba(180,35,24,0.10)', color: '#B42318' }
        : { backgroundColor: 'rgba(47,107,63,0.10)', color: '#2F6B3F' }}
      role="status"
    >
      {message}
    </div>
  );
}

/** Pavé numérique de saisie d'une quantité. */
export function QtyPad({ title, subtitle, value, onKey, onCancel, onSave }: {
  title: string;
  subtitle?: string;
  value: string;
  onKey: (k: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink/40" onClick={onCancel}>
      <div className="bg-surface rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}
           style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="font-semibold leading-tight truncate">{title}</div>
        {subtitle && <div className="text-xs text-ink-soft">{subtitle}</div>}
        <div className="mt-2 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
          {value === '' ? <span className="text-ink-soft/40">0</span> : value}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
            <button key={k} onClick={() => onKey(k)}
              className={`h-14 rounded-xl text-xl font-semibold ${
                k === 'C' ? 'bg-danger/10 text-danger'
                : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                : 'bg-gray-50 border border-border'}`}>{k}</button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="btn-soft h-12">Annuler</button>
          <button onClick={onSave} className="btn-primary h-12">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

/** Barre d'action collée en bas de l'écran. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-border bg-surface p-3">{children}</div>
  );
}

/* -------------------------------------------------------------------- icônes */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function IconArrowLeft() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>;
}
export function IconHome() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>;
}
export function IconChevron() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="m9 6 6 6-6 6" /></svg>;
}
export function IconBarcode() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M4 6v12M7.5 6v12M11 6v12M14.5 6v12M18 6v12M20.5 6v12" /></svg>;
}
export function IconScanFrame() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" /><path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" /><path d="M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" /><path d="M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M7 12h10" /></svg>;
}
export function IconBox() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...S}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></svg>;
}
export function IconScanIn() {
  return <svg width="24" height="24" viewBox="0 0 24 24" {...S}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3" /><path d="M21 21h-4" /><path d="M21 17v4" /></svg>;
}
export function IconTag() {
  return <svg width="24" height="24" viewBox="0 0 24 24" {...S}><path d="M4 7v10M7 7v10M10 7v10M13.5 7v10M17 7v10M20 7v10" /></svg>;
}
export function IconClipboard() {
  return <svg width="24" height="24" viewBox="0 0 24 24" {...S}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M9 10h6M9 14h6M9 18h3" /></svg>;
}
export function IconGear() {
  return <svg width="24" height="24" viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></svg>;
}
export function IconTrash() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg>;
}
export function IconPrinter() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="7" rx="1.5" /><path d="M7 16h10v5H7z" /></svg>;
}
export function IconPlus() {
  return <svg width="20" height="20" viewBox="0 0 24 24" {...S}><path d="M12 5v14M5 12h14" /></svg>;
}
