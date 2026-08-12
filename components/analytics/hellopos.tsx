'use client';

import { formatEUR } from '@/lib/services/money';

/**
 * Le langage visuel des graphiques HelloPos.
 *
 * Il est né sur « Ma journée », l'écran du comptoir, et y était enfermé :
 * `components/analytics/charts.tsx` servait le tableau de bord et parlait un
 * autre dialecte — vert #22c55e, ambre #f59e0b, bleu #3b82f6, des couleurs
 * d'aucune marque. Deux écrans qui montrent les mêmes chiffres n'ont pas à
 * avoir deux palettes ; ce module est celle qu'ils partagent désormais.
 *
 * Ce qui vit ici : la palette, l'échelle d'axe, l'anneau des encaissements et
 * l'état vide. Ce qui n'y vit pas : les tracés propres à un écran (la courbe
 * 24 h de la journée, la courbe comparée du tableau de bord), qui restent
 * chacun chez eux.
 */

/** Or lisible sur fond blanc (le #FFEFB3 de la marque disparaît en trait fin). */
export const OR = '#D9A825';
export const VERT = 'var(--primary)';
export const GRIS = '#CFCABA';
export const GRILLE = 'rgba(120,120,120,0.16)';
export const AXE = 'var(--ink-soft, #6b7280)';

/** Couleurs de l'anneau : la marque d'abord, le gris pour le reste. */
export const COULEURS_PAIEMENT = [VERT, OR, GRIS, '#8FB3A8', '#B9A16B'];

/** Échelle d'axe : un montant court, sans décimale inutile. */
export function courtEUR(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k€`;
  return `${Math.round(n)} €`;
}

/* ------------------------------------------------------------------ */
/* Anneau des moyens de paiement                                       */
/* ------------------------------------------------------------------ */

export function AnneauPaiements({ parts }: {
  parts: { label: string; montant: number; couleur: string }[];
}) {
  const total = parts.reduce((s, p) => s + p.montant, 0);
  const R = 62, EP = 18, C = 80;
  const perimetre = 2 * Math.PI * R;
  let debut = 0;
  const premiere = [...parts].sort((a, b) => b.montant - a.montant)[0];
  const pctPremiere = total > 0 && premiere ? Math.round((premiere.montant / total) * 100) : 0;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: 160, height: 160 }}>
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90" role="img"
             aria-label="Répartition des encaissements par moyen de paiement">
          <circle cx={C} cy={C} r={R} fill="none" stroke="#EDEAE0" strokeWidth={EP} />
          {total > 0 && parts.map((p) => {
            const frac = p.montant / total;
            if (frac <= 0) return null;
            const el = (
              <circle
                key={p.label} cx={C} cy={C} r={R} fill="none" stroke={p.couleur} strokeWidth={EP}
                strokeDasharray={`${(frac * perimetre).toFixed(2)} ${perimetre.toFixed(2)}`}
                strokeDashoffset={(-debut * perimetre).toFixed(2)}
              />
            );
            debut += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-2xl font-semibold tracking-tight">{pctPremiere}%</div>
            <div className="text-[11px] text-ink-soft">{premiere?.label ?? '—'}</div>
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.couleur }} />
            <span className="text-ink-soft truncate">{p.label}</span>
            <span className="ml-auto tabular-nums whitespace-nowrap">
              {formatEUR(p.montant)}{' '}
              <span className="text-ink-soft">
                ({total > 0 ? Math.round((p.montant / total) * 100) : 0}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Bloc « rien à afficher » : une pastille, un titre, une phrase. */
export function EtatVide({ icone, titre, texte }: {
  icone: 'graph' | 'tag' | 'doc'; titre: string; texte: string;
}) {
  const chemins = {
    graph: <path d="M4 20V10m6 10V4m6 16v-7" />,
    tag: <><path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
    doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M9 12h6M9 16h6" /></>,
  }[icone];
  return (
    <div className="text-center px-4">
      <div className="mx-auto h-12 w-12 rounded-full grid place-items-center bg-accent-soft">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
             className="text-accent-deep">
          {chemins}
        </svg>
      </div>
      <div className="mt-2 text-sm font-semibold">{titre}</div>
      <div className="mt-0.5 text-xs text-ink-soft">{texte}</div>
    </div>
  );
}
