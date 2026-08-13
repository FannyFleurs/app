'use client';

import { OR, GRILLE, AXE, courtEUR, EtatVide } from '@/components/analytics/hellopos';

/**
 * Les tracés propres à « Ma journée » : la courbe des ventes heure par heure
 * et la micro-courbe du bandeau CA.
 *
 * La palette, l'anneau des encaissements et l'état vide ne vivent plus ici :
 * ils sont passés dans `@/components/analytics/hellopos`, que le tableau de
 * bord partage désormais. Ils restent réexportés ci-dessous — cet écran les
 * importe depuis ce fichier depuis toujours, et rien ne gagne à réécrire ses
 * imports.
 */

export {
  AnneauPaiements, EtatVide, COULEURS_PAIEMENT,
} from '@/components/analytics/hellopos';

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
    // `h-full` : la courbe suit la hauteur que lui laisse la carte, au lieu de
    // l'imposer par son rapport largeur/hauteur. Le viewBox et le
    // `preserveAspectRatio` par défaut font le reste — le dessin se réduit
    // sans se déformer, et la page tient dans l'écran.
    <div className="relative h-full min-h-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img"
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
