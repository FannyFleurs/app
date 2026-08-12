'use client';

import { OR, VERT, GRILLE, AXE, courtEUR, EtatVide } from '@/components/analytics/hellopos';

/**
 * Les tracés du tableau de bord.
 *
 * Ils parlaient leur propre dialecte — vert #22c55e, ambre #f59e0b, bleu
 * #3b82f6 — quand « Ma journée » montrait les mêmes chiffres dans les couleurs
 * HelloPos. Deux écrans, deux palettes, pour une seule boutique. La palette,
 * la grille en pointillés et l'état vide viennent maintenant du langage
 * partagé ; ne restent ici que les tracés propres à cet écran, la courbe
 * comparée à l'an dernier et les barres.
 *
 * Les couleurs suivent « Ma journée » à la lettre : les COURBES portent l'or,
 * les BARRES le vert de la marque — c'est ce que fait l'écran du comptoir avec
 * sa courbe horaire et ses barres de catégories. La période comparée reste
 * dans l'autre couleur, en retrait, pour qu'on lise d'abord la période en
 * cours.
 */

/** Format court pour les axes. Identique à celui de « Ma journée ». */
const short = courtEUR;

/* ------------------------------------------------------------------ */
/* Courbe comparée (période courante vs N-1)                          */
/* ------------------------------------------------------------------ */

export function LineCompare({
  labels, current, prev, currentLabel, prevLabel,
}: {
  labels: string[];
  current: number[];
  prev: number[];
  currentLabel: string;
  prevLabel: string;
}) {
  const W = 720, H = 240, padL = 48, padR = 8, padT = 12, padB = 26;
  const n = labels.length;
  const vide = current.every((v) => v === 0) && prev.every((v) => v === 0);
  // Période sans vente : une échelle de repli à 100 €, comme « Ma journée ».
  // Sans elle, `Math.max(1, …)` donnait une graduation qui répétait « 1 € » sur
  // quatre paliers — une grille qui a l'air cassée sous l'état vide.
  const max = vide ? 100 : Math.max(1, ...current, ...prev);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(n / 12));
  // Un identifiant de dégradé par instance : deux courbes sur la même page
  // partageraient sinon la même définition SVG, et la seconde repeindrait la
  // première.
  const aireId = `dash-aire-${currentLabel.replace(/\W+/g, '')}`;
  const aire = n > 1
    ? `${path(current)} L ${x(n - 1).toFixed(1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`
    : '';

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img">
        <defs>
          <linearGradient id={aireId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={OR} stopOpacity="0.28" />
            <stop offset="100%" stopColor={OR} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid.map((g) => {
          const yy = padT + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={GRILLE} strokeWidth={1}
                    strokeDasharray={g === 0 ? undefined : '3 4'} />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize={10} fill={AXE}>{short(max * g)}</text>
            </g>
          );
        })}
        {!vide && (
          <>
            {n > 1 && <path d={aire} fill={`url(#${aireId})`} />}
            {/* L'an dernier en pointillés : une référence, pas une mesure. */}
            {n > 1 && <path d={path(prev)} fill="none" stroke={VERT} strokeWidth={1.75}
                            strokeDasharray="4 4" strokeLinejoin="round" opacity={0.55} />}
            {n > 1 && <path d={path(current)} fill="none" stroke={OR} strokeWidth={2.5}
                            strokeLinejoin="round" strokeLinecap="round" />}
            {current.map((v, i) => (
              <circle key={`c${i}`} cx={x(i)} cy={y(v)} r={n > 30 ? 0 : 3} fill={OR} />
            ))}
          </>
        )}
        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={AXE}>{l}</text>
          ) : null,
        )}
      </svg>
      {vide && (
        <div className="absolute inset-0 grid place-items-center">
          <EtatVide icone="graph" titre="Aucune donnée"
                    texte="Aucune vente enregistrée pour cette période." />
        </div>
      )}
      <Legend items={[{ color: OR, label: currentLabel }, { color: VERT, label: prevLabel }]} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barres (CA par heure / par jour) — courant en barre pleine          */
/* ------------------------------------------------------------------ */

export function Bars({
  labels, values, prev, currentLabel, prevLabel, labelStep = 1,
}: {
  labels: string[];
  values: number[];
  prev?: number[];
  currentLabel?: string;
  prevLabel?: string;
  labelStep?: number;
}) {
  const W = 720, H = 240, padL = 48, padR = 8, padT = 12, padB = 26;
  const n = values.length;
  const vide = values.every((v) => v === 0) && (prev ?? []).every((v) => v === 0);
  // Même échelle de repli que la courbe : voir le commentaire dans LineCompare.
  const max = vide ? 100 : Math.max(1, ...values, ...(prev ?? []));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / n;
  const hasPrev = !!prev;
  const barW = Math.max(2, (hasPrev ? slot * 0.36 : slot * 0.6));
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img">
        {grid.map((g) => {
          const yy = padT + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={GRILLE} strokeWidth={1}
                    strokeDasharray={g === 0 ? undefined : '3 4'} />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize={10} fill={AXE}>{short(max * g)}</text>
            </g>
          );
        })}
        {!vide && values.map((v, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = (v / max) * innerH;
          const pv = prev?.[i] ?? 0;
          const ph = (pv / max) * innerH;
          return (
            <g key={i}>
              {hasPrev && (
                <rect x={cx - barW - 1} y={padT + innerH - ph} width={barW} height={Math.max(0, ph)}
                      rx={3} fill={OR} opacity={0.55} />
              )}
              <rect x={hasPrev ? cx + 1 : cx - barW / 2} y={padT + innerH - h} width={barW}
                    height={Math.max(0, h)} rx={3} fill={VERT} />
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={AXE}>{l}</text>
          ) : null,
        )}
      </svg>
      {vide && (
        <div className="absolute inset-0 grid place-items-center">
          <EtatVide icone="graph" titre="Aucune donnée"
                    texte="Aucune vente enregistrée pour cette période." />
        </div>
      )}
      {currentLabel && (
        <Legend
          items={[
            { color: VERT, label: currentLabel },
            ...(prevLabel ? [{ color: OR, label: prevLabel }] : []),
          ]}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink-soft">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
