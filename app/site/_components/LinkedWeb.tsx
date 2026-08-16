import { LINKED_NODES } from '@/lib/site/content/home';
import { Icon } from './icons';

/**
 * « Tout est lié » — la carte des briques de l'activité.
 *
 * Grand écran : huit briques réparties de part et d'autre, reliées au centre
 * par des traits qui se dessinent à l'apparition. Les coordonnées HTML et SVG
 * partagent le même repère (1200 × 520), ce qui garantit que les traits
 * touchent exactement les briques, quelle que soit la largeur.
 *
 * Mobile : une colonne, un filet vertical, aucune géométrie à tenir.
 */

const VB = { w: 1200, h: 520 };
const CENTER = { x: 600, y: 260 };
const POSITIONS = [
  { x: 175, y: 62 },
  { x: 175, y: 194 },
  { x: 175, y: 326 },
  { x: 175, y: 458 },
  { x: 1025, y: 62 },
  { x: 1025, y: 194 },
  { x: 1025, y: 326 },
  { x: 1025, y: 458 },
];

export default function LinkedWeb() {
  return (
    <>
      {/* --- Grand écran --------------------------------------------- */}
      <div className="hp-web" aria-hidden="true" data-reveal>
        <svg className="hp-web-lines" viewBox={`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet">
          {POSITIONS.map((p, i) => {
            const dir = p.x < CENTER.x ? 1 : -1;
            // Le trait démarre après le libellé de la brique (largeur du bloc
            // divisée par deux) pour ne jamais le barrer.
            const sx = p.x + dir * 132;
            return (
              <path
                key={i}
                d={`M ${sx} ${p.y} C ${sx + dir * 150} ${p.y} ${CENTER.x - dir * 160} ${CENTER.y} ${CENTER.x - dir * 88} ${CENTER.y}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                data-line={dir === 1 ? 'ltr' : 'rtl'}
                style={{ ['--reveal-delay' as string]: `${i * 90}ms` }}
              />
            );
          })}
          <circle cx={CENTER.x} cy={CENTER.y} r="3" fill="currentColor" />
        </svg>

        {LINKED_NODES.map((n, i) => {
          const p = POSITIONS[i] ?? CENTER;
          return (
            <div
              key={n.label}
              className="hp-web-node"
              style={{ left: `${(p.x / VB.w) * 100}%`, top: `${(p.y / VB.h) * 100}%` }}
            >
              <span className="hp-web-node-icon">
                <Icon name={n.icon} size={18} />
              </span>
              <span>
                <b>{n.label}</b>
                <em>{n.note}</em>
              </span>
            </div>
          );
        })}

        <p className="hp-web-center hp-h2">Tout est lié.</p>
      </div>

      {/* --- Mobile --------------------------------------------------- */}
      <ul className="hp-web-list">
        {LINKED_NODES.map((n) => (
          <li key={n.label}>
            <span className="hp-web-node-icon" aria-hidden="true">
              <Icon name={n.icon} size={16} />
            </span>
            <span>
              <b>{n.label}</b>
              <em>{n.note}</em>
            </span>
          </li>
        ))}
        <li className="hp-web-list-end">
          <b className="hp-h3">Tout est lié.</b>
        </li>
      </ul>
    </>
  );
}
