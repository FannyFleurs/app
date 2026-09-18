// Répartition d'un objectif MENSUEL de CA sur les jours du mois, selon un poids
// par jour de semaine (0 = boutique fermée). Purs helpers (client + serveur +
// tests) : aucune dépendance base de données.

/** Poids par jour de semaine, LUNDI d'abord (index 0=lundi … 6=dimanche). 0 = fermé. */
export type WeekWeights = [number, number, number, number, number, number, number];

/** Défaut : ouvert du lundi au samedi (poids 1), fermé le dimanche. */
export const DEFAULT_WEIGHTS: WeekWeights = [1, 1, 1, 1, 1, 1, 0];

export function normalizeWeights(input: unknown): WeekWeights {
  const arr = Array.isArray(input) ? input : [];
  const out = DEFAULT_WEIGHTS.slice() as number[];
  for (let i = 0; i < 7; i++) {
    const v = Number(arr[i]);
    out[i] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_WEIGHTS[i]!;
  }
  return out as WeekWeights;
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Index LUNDI-d'abord (0=lundi … 6=dimanche) d'une date ISO. */
export function weekdayIndex(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const js = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=dim … 6=sam
  return (js + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Toutes les dates ISO (aaaa-mm-jj) d'un mois. */
export function eachDayOfMonth(year: number, month: number): string[] {
  const n = daysInMonth(year, month);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) out.push(`${year}-${pad2(month)}-${pad2(d)}`);
  return out;
}

export interface DayRow {
  date: string;
  weekday: number;      // 0=lundi … 6=dimanche
  open: boolean;
  objective: number;    // objectif du jour (0 si fermé)
  realized: number;     // CA réalisé du jour
  tickets: number;
  avg: number;          // panier moyen
  future: boolean;      // jour postérieur à aujourd'hui
  status: 'closed' | 'future' | 'ok' | 'below';
}

export interface MonthBreakdown {
  year: number; month: number;
  daysInMonth: number;
  objectiveMonth: number;
  openDays: number;
  days: DayRow[];
  realizedToDate: number;
  theoreticalToDate: number;      // objectif cumulé attendu à aujourd'hui
  avanceRetard: number;           // réalisé − théorique à date
  projection: number;             // extrapolation fin de mois
  attainmentPct: number;          // réalisé / théorique à date (%)
  objectiveToday: number;
  objectiveWeek: number;          // objectif de la semaine en cours (lun→dim)
  objectivePerOpenDay: number;    // moyenne objectif / jour ouvré
  objectivePerWeek: number;       // objectif × 7 / nb jours du mois
  isPast: boolean; isCurrent: boolean; isFuture: boolean;
}

/**
 * Construit la répartition journalière d'un objectif mensuel.
 * `realized` : CA et nb tickets réels par date ISO. `todayIso` : borne "à date".
 */
export function monthBreakdown(args: {
  year: number; month: number;
  objectiveMonth: number;
  weights: WeekWeights;
  todayIso: string;
  realized: Record<string, { ca: number; tickets: number }>;
}): MonthBreakdown {
  const { year, month, objectiveMonth, weights, todayIso, realized } = args;
  const dim = daysInMonth(year, month);
  const dates = eachDayOfMonth(year, month);

  // Somme des poids des jours du mois (les jours fermés comptent 0).
  let sumW = 0;
  for (const d of dates) sumW += weights[weekdayIndex(d)] ?? 0;

  const now = new Date(todayIso + 'T00:00:00Z');
  const first = new Date(`${year}-${pad2(month)}-01T00:00:00Z`);
  const last = new Date(`${year}-${pad2(month)}-${pad2(dim)}T00:00:00Z`);
  const isCurrent = now >= first && now <= last;
  const isPast = now > last;
  const isFuture = now < first;

  let openDays = 0;
  let realizedToDate = 0;
  let theoreticalToDate = 0;

  const days: DayRow[] = dates.map((date) => {
    const wd = weekdayIndex(date);
    const w = weights[wd] ?? 0;
    const open = w > 0;
    if (open) openDays += 1;
    const objective = sumW > 0 ? Number(((objectiveMonth * w) / sumW).toFixed(2)) : 0;
    const r = realized[date];
    const ca = r ? r.ca : 0;
    const tickets = r ? r.tickets : 0;
    const future = date > todayIso;
    if (!future) { realizedToDate += ca; theoreticalToDate += objective; }
    let status: DayRow['status'];
    if (!open) status = 'closed';
    else if (future) status = 'future';
    else status = ca >= objective ? 'ok' : 'below';
    return {
      date, weekday: wd, open, objective,
      realized: Number(ca.toFixed(2)), tickets,
      avg: tickets > 0 ? Number((ca / tickets).toFixed(2)) : 0,
      future, status,
    };
  });

  const theo = Number(theoreticalToDate.toFixed(2));
  const real = Number(realizedToDate.toFixed(2));
  const projection = isPast
    ? real
    : theo > 0 ? Number(((real * objectiveMonth) / theo).toFixed(2)) : 0;
  const attainmentPct = theo > 0 ? Number(((real / theo) * 100).toFixed(1)) : 0;

  // Objectif du jour + de la semaine en cours (lundi→dimanche).
  const objectiveToday = days.find((d) => d.date === todayIso)?.objective ?? 0;
  let objectiveWeek = 0;
  if (isCurrent) {
    const wd = weekdayIndex(todayIso); // 0=lundi
    const startMs = new Date(todayIso + 'T00:00:00Z').getTime() - wd * 86400000;
    for (let i = 0; i < 7; i++) {
      const iso = new Date(startMs + i * 86400000).toISOString().slice(0, 10);
      const day = days.find((d) => d.date === iso);
      if (day) objectiveWeek += day.objective;
    }
  }

  return {
    year, month, daysInMonth: dim,
    objectiveMonth,
    openDays,
    days,
    realizedToDate: real,
    theoreticalToDate: theo,
    avanceRetard: Number((real - theo).toFixed(2)),
    projection,
    attainmentPct,
    objectiveToday,
    objectiveWeek: Number(objectiveWeek.toFixed(2)),
    objectivePerOpenDay: openDays > 0 ? Number((objectiveMonth / openDays).toFixed(2)) : 0,
    objectivePerWeek: dim > 0 ? Number(((objectiveMonth * 7) / dim).toFixed(2)) : 0,
    isPast, isCurrent, isFuture,
  };
}
