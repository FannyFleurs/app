'use client';

import { formatEUR } from '@/lib/services/money';

/**
 * Les trois dessins de « Ma journée » : la courbe des ventes, l'anneau des
 * moyens de paiement, et la micro-courbe du bandeau CA.
 *
 * Ils sont écrits ici plutôt que repris de components/analytics/charts.tsx :
 * ce dernier sert le tableau de bord et parle en vert/ambre/bleu, alors que
 * cet écran est celui du comptoir et doit rester dans les couleurs HelloPos.
 */

/** Or lisible sur fond blanc (le #FFEFB3 de la marque disparaît en trait fin). */
const OR = '#D9A825';
const VERT = 'var(--primary)';
const GRIS = '#CFCABA';
const GRILLE = 'rgba(120,120,120,0.16)';
const AXE = 'var(--ink-soft, #6b7280)';

/** Échelle d'axe : un montant court, sans décimale inutile. */
function courtEUR(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k€`;
  return `${Math.round(n)} €`;
}

/* ------------------------------------------------------------------ */
/* Courbe du jour, heure par heure                                     */
/* ------------------------------------------------------------------ */

export function CourbeJournee({ valeurs, vide }: {
  /** 24 montants, un par heure (index = heure de 0 à 23). */
  valeurs: number[];
  vide: boolean;
}) {
  const W = 720, H = 250, padL = 52, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  // Échelle : au moins 100 € pour que la grille reste lisible un jour creux,
  // exactement comme un compteur qui ne part pas de zéro à chaque vente.
  const max = Math.max(100, ...valeurs);
  const n = valeurs.length;
  const x = (i: number) => padL + (i / (n - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const trait = valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const aire = `${trait} L ${x(n - 1).toFixed(1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;
  const paliers = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img"
           aria-label="Évolution du chiffre d'affaires heure par heure">
        <defs>
          <linearGradient id="mj-aire" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={OR} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {paliers.map((p) => {
          const yy = padT + innerH - p * innerH;
          return (
            <g key={p}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={GRILLE} strokeWidth={1}
                    strokeDasharray={p === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize={11} fill={AXE}>
                {courtEUR(max * p)}
              </text>
            </g>
          );
        })}
        {!vide && (
          <>
            <path d={aire} fill="url(#mj-aire)" />
            <path d={trait} fill="none" stroke={OR} strokeWidth={2.5}
                  strokeLinejoin="round" strokeLinecap="round" />
            {valeurs.map((v, i) => (v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={OR} /> : null))}
          </>
        )}
        {[0, 4, 8, 12, 16, 20, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 8} textAnchor="middle" fontSize={11} fill={AXE}>
            {String(h === 23 ? 24 : h).padStart(2, '0')}h
          </text>
        ))}
      </svg>
      {vide && (
        <div className="absolute inset-0 grid place-items-center">
          <EtatVide icone="graph" titre="Aucune donnée"
                    texte="Aucune vente enregistrée pour cette période." />
        </div>
      )}
    </div>
  );
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

/** Couleurs de l'anneau : la marque d'abord, le gris pour le reste. */
export const COULEURS_PAIEMENT = [VERT, OR, GRIS, '#8FB3A8', '#B9A16B'];

/* ------------------------------------------------------------------ */
/* Micro-courbe du bandeau CA                                          */
/* ------------------------------------------------------------------ */

export function MicroCourbe({ valeurs }: { valeurs: number[] }) {
  const W = 260, H = 46;
  const max = Math.max(1, ...valeurs);
  const n = valeurs.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 6) - 3;
  const trait = valeurs.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 46 }} aria-hidden="true">
      <path d={`${trait} L ${W} ${H} L 0 ${H} Z`} fill={OR} opacity={0.16} />
      <path d={trait} fill="none" stroke={OR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
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
