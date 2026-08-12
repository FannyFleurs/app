'use client';

import { formatEUR } from '@/lib/services/money';

/* Format court pour les axes : 1 234 € → "1,2 k€". */
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return `${(n / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',')} k€`;
  return `${Math.round(n)} €`;
}

const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const GRID = 'rgba(120,120,120,0.18)';
const AXIS = 'var(--ink-soft, #6b7280)';

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
  const max = Math.max(1, ...current, ...prev);
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(n / 12));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img">
        {grid.map((g) => {
          const yy = padT + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize={10} fill={AXIS}>{short(max * g)}</text>
            </g>
          );
        })}
        {n > 1 && <path d={path(prev)} fill="none" stroke={AMBER} strokeWidth={2} strokeLinejoin="round" />}
        {n > 1 && <path d={path(current)} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinejoin="round" />}
        {current.map((v, i) => (
          <circle key={`c${i}`} cx={x(i)} cy={y(v)} r={n > 30 ? 0 : 3} fill={GREEN} />
        ))}
        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={AXIS}>{l}</text>
          ) : null,
        )}
      </svg>
      <Legend items={[{ color: GREEN, label: currentLabel }, { color: AMBER, label: prevLabel }]} />
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
  const max = Math.max(1, ...values, ...(prev ?? []));
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / n;
  const hasPrev = !!prev;
  const barW = Math.max(2, (hasPrev ? slot * 0.36 : slot * 0.6));
  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }} role="img">
        {grid.map((g) => {
          const yy = padT + innerH - g * innerH;
          return (
            <g key={g}>
              <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize={10} fill={AXIS}>{short(max * g)}</text>
            </g>
          );
        })}
        {values.map((v, i) => {
          const cx = padL + slot * i + slot / 2;
          const h = (v / max) * innerH;
          const pv = prev?.[i] ?? 0;
          const ph = (pv / max) * innerH;
          return (
            <g key={i}>
              {hasPrev && (
                <rect x={cx - barW - 1} y={padT + innerH - ph} width={barW} height={Math.max(0, ph)}
                      rx={2} fill={AMBER} opacity={0.55} />
              )}
              <rect x={hasPrev ? cx + 1 : cx - barW / 2} y={padT + innerH - h} width={barW}
                    height={Math.max(0, h)} rx={2} fill="#3b82f6" />
            </g>
          );
        })}
        {labels.map((l, i) =>
          i % labelStep === 0 ? (
            <text key={i} x={padL + slot * i + slot / 2} y={H - 8} textAnchor="middle" fontSize={10} fill={AXIS}>{l}</text>
          ) : null,
        )}
      </svg>
      {currentLabel && (
        <Legend
          items={[
            { color: '#3b82f6', label: currentLabel },
            ...(prevLabel ? [{ color: AMBER, label: prevLabel }] : []),
          ]}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barre empilée horizontale (moyens de paiement)                      */
/* ------------------------------------------------------------------ */

export function StackedBar({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return <p className="text-sm text-ink-soft">Aucun encaissement sur la période.</p>;
  return (
    <div>
      <div className="flex h-12 w-full overflow-hidden rounded-lg">
        {slices.map((s) => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={s.label}
              className="grid place-items-center text-xs font-semibold text-white overflow-hidden whitespace-nowrap"
              style={{ width: `${pct}%`, backgroundColor: s.color }}
              title={`${s.label} : ${formatEUR(s.value)}`}
            >
              {pct >= 12 ? `${s.label}: ${formatEUR(s.value)}` : ''}
            </div>
          );
        })}
      </div>
      <Legend items={slices.map((s) => ({ color: s.color, label: `${s.label} · ${formatEUR(s.value)}` }))} />
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
