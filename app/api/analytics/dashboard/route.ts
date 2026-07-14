import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import {
  PAYMENT_LABELS,
  type DashboardData, type KpiSet, type ProductRow,
} from '@/lib/analytics/dashboard';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  store_id: z.string().uuid().optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function shiftYear(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC((y as number) + delta, (m as number) - 1, d as number));
  return dt.toISOString().slice(0, 10);
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let cur = Date.UTC(fy as number, (fm as number) - 1, fd as number);
  const end = Date.UTC(ty as number, (tm as number) - 1, td as number);
  let guard = 0;
  while (cur <= end && guard < 800) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
    guard++;
  }
  return out;
}

function fmtRange(from: string, to: string): string {
  const opt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const a = new Date(from + 'T00:00:00Z').toLocaleDateString('fr-FR', opt);
  const b = new Date(to + 'T00:00:00Z').toLocaleDateString('fr-FR', opt);
  return `${a} – ${b}`;
}

export async function GET(req: Request) {
  const g = await requireSession();
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    store_id: url.searchParams.get('store_id') || undefined,
    from: url.searchParams.get('from'),
    to:   url.searchParams.get('to'),
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { store_id, from, to } = parsed.data;
  const org = g.user.organizationId;

  const pFrom = shiftYear(from, -1);
  const pTo = shiftYear(to, -1);

  // Filtre boutique optionnel. On construit deux jeux d'arguments (courant / N-1).
  const storeSql = store_id ? 'AND s.store_id = $4' : '';
  const argsCur: unknown[] = store_id ? [org, from, to, store_id] : [org, from, to];
  const argsPrev: unknown[] = store_id ? [org, pFrom, pTo, store_id] : [org, pFrom, pTo];

  // ---- KPIs (courant + N-1) ------------------------------------------------
  async function kpis(args: unknown[]): Promise<KpiSet> {
    const s = (await query<{
      ca_ttc: string; ca_ht: string; tva: string; tickets: number; customers: number;
    }>(
      `SELECT COALESCE(SUM(total_ttc),0)::text AS ca_ttc,
              COALESCE(SUM(total_ht),0)::text  AS ca_ht,
              COALESCE(SUM(total_tva),0)::text AS tva,
              COUNT(*)::int AS tickets,
              COUNT(DISTINCT customer_id)::int AS customers
         FROM sales s
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}`,
      args,
    )).rows[0]!;
    const m = (await query<{ revenue_ht: string; cost_ht: string }>(
      `SELECT COALESCE(SUM(sl.line_ht),0)::text AS revenue_ht,
              COALESCE(SUM(COALESCE(p.purchase_price_ht,0)*sl.quantity),0)::text AS cost_ht
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
         LEFT JOIN products p ON p.id = sl.product_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}`,
      args,
    )).rows[0]!;
    const ca_ttc = Number(s.ca_ttc), ca_ht = Number(s.ca_ht), tickets = Number(s.tickets);
    const marge = Number((Number(m.revenue_ht) - Number(m.cost_ht)).toFixed(2));
    return {
      ca_ttc, ca_ht, tva: Number(s.tva), tickets, customers: Number(s.customers),
      marge,
      avg_ttc: tickets > 0 ? Number((ca_ttc / tickets).toFixed(2)) : 0,
      avg_ht:  tickets > 0 ? Number((ca_ht / tickets).toFixed(2)) : 0,
    };
  }

  // ---- Séries journalières (revenu + marge) --------------------------------
  async function dailyRevenue(args: unknown[]) {
    return (await query<{ d: string; ttc: string; ht: string; n: number }>(
      `SELECT (s.validated_at AT TIME ZONE 'Europe/Paris')::date::text AS d,
              COALESCE(SUM(total_ttc),0)::text AS ttc,
              COALESCE(SUM(total_ht),0)::text  AS ht,
              COUNT(*)::int AS n
         FROM sales s
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY 1`,
      args,
    )).rows;
  }
  async function dailyMarge(args: unknown[]) {
    return (await query<{ d: string; marge: string }>(
      `SELECT (s.validated_at AT TIME ZONE 'Europe/Paris')::date::text AS d,
              COALESCE(SUM(sl.line_ht - COALESCE(p.purchase_price_ht,0)*sl.quantity),0)::text AS marge
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
         LEFT JOIN products p ON p.id = sl.product_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY 1`,
      args,
    )).rows;
  }

  // ---- CA par heure --------------------------------------------------------
  async function hourly(args: unknown[]) {
    return (await query<{ h: number; ttc: string; ht: string }>(
      `SELECT EXTRACT(HOUR FROM (s.validated_at AT TIME ZONE 'Europe/Paris'))::int AS h,
              COALESCE(SUM(total_ttc),0)::text AS ttc,
              COALESCE(SUM(total_ht),0)::text  AS ht
         FROM sales s
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY 1`,
      args,
    )).rows;
  }

  // ---- CA par jour de semaine ---------------------------------------------
  async function weekday(args: unknown[]) {
    return (await query<{ dow: number; ttc: string; ht: string }>(
      `SELECT EXTRACT(DOW FROM (s.validated_at AT TIME ZONE 'Europe/Paris'))::int AS dow,
              COALESCE(SUM(total_ttc),0)::text AS ttc,
              COALESCE(SUM(total_ht),0)::text  AS ht
         FROM sales s
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY 1`,
      args,
    )).rows;
  }

  // Exécution (courant + N-1 en parallèle par bloc).
  const [
    curKpi, prevKpi,
    curRev, prevRev, curMarge, prevMarge,
    curHour, prevHour, curWd, prevWd,
    payRows, tvaRows, prodRows,
  ] = await Promise.all([
    kpis(argsCur), kpis(argsPrev),
    dailyRevenue(argsCur), dailyRevenue(argsPrev), dailyMarge(argsCur), dailyMarge(argsPrev),
    hourly(argsCur), hourly(argsPrev), weekday(argsCur), weekday(argsPrev),
    // Moyens de paiement (encaissé, TTC) — période courante.
    query<{ method: string; amount: string }>(
      `SELECT pay.method, COALESCE(SUM(pay.amount),0)::text AS amount
         FROM payments pay JOIN sales s ON s.id = pay.sale_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY pay.method
        ORDER BY 2 DESC`,
      argsCur,
    ),
    // Détail TVA (courant).
    query<{ rate: string; base_ht: string; tva: string; ttc: string }>(
      `SELECT sl.tax_rate::text AS rate,
              COALESCE(SUM(sl.line_ht),0)::text  AS base_ht,
              COALESCE(SUM(sl.line_tva),0)::text AS tva,
              COALESCE(SUM(sl.line_ttc),0)::text AS ttc
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY sl.tax_rate ORDER BY sl.tax_rate`,
      argsCur,
    ),
    // Produits (courant) — triés par CA TTC décroissant.
    query<{ label: string; qty: string; ttc: string; ht: string }>(
      `SELECT sl.label,
              COALESCE(SUM(sl.quantity),0)::text AS qty,
              COALESCE(SUM(sl.line_ttc),0)::text AS ttc,
              COALESCE(SUM(sl.line_ht),0)::text  AS ht
         FROM sale_lines sl JOIN sales s ON s.id = sl.sale_id
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND (s.validated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date ${storeSql}
        GROUP BY sl.label ORDER BY SUM(sl.line_ttc) DESC`,
      argsCur,
    ),
  ]);

  // ---- Assemblage des séries journalières (alignées par index de jour) -----
  const curDays = eachDay(from, to);
  const prevDays = eachDay(pFrom, pTo);
  const n = curDays.length;

  const revMap = (rows: { d: string; ttc: string; ht: string; n: number }[]) =>
    new Map(rows.map((r) => [r.d, r]));
  const margeMap = (rows: { d: string; marge: string }[]) =>
    new Map(rows.map((r) => [r.d, Number(r.marge)]));

  const cr = revMap(curRev), pr = revMap(prevRev);
  const cm = margeMap(curMarge), pm = margeMap(prevMarge);

  const labels: string[] = [];
  const ca_ttc: number[] = [], ca_ht: number[] = [];
  const ticket_ttc: number[] = [], ticket_ht: number[] = [];
  const marge: number[] = [];
  const prev_ca_ttc: number[] = [], prev_ca_ht: number[] = [];
  const prev_ticket_ttc: number[] = [], prev_ticket_ht: number[] = [];
  const prev_marge: number[] = [];

  for (let i = 0; i < n; i++) {
    const cd = curDays[i]!;
    const pd = prevDays[i] ?? '';
    labels.push(new Date(cd + 'T00:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
    const c = cr.get(cd); const p = pr.get(pd);
    const cTtc = c ? Number(c.ttc) : 0, cHt = c ? Number(c.ht) : 0, cN = c ? c.n : 0;
    const pTtc = p ? Number(p.ttc) : 0, pHt = p ? Number(p.ht) : 0, pN = p ? p.n : 0;
    ca_ttc.push(cTtc); ca_ht.push(cHt);
    ticket_ttc.push(cN > 0 ? Number((cTtc / cN).toFixed(2)) : 0);
    ticket_ht.push(cN > 0 ? Number((cHt / cN).toFixed(2)) : 0);
    marge.push(cm.get(cd) ?? 0);
    prev_ca_ttc.push(pTtc); prev_ca_ht.push(pHt);
    prev_ticket_ttc.push(pN > 0 ? Number((pTtc / pN).toFixed(2)) : 0);
    prev_ticket_ht.push(pN > 0 ? Number((pHt / pN).toFixed(2)) : 0);
    prev_marge.push(pm.get(pd) ?? 0);
  }

  // ---- Heures (0..23) ------------------------------------------------------
  const curH = new Map(curHour.map((r) => [r.h, r]));
  const prevH = new Map(prevHour.map((r) => [r.h, r]));
  const hourlyOut = Array.from({ length: 24 }, (_, h) => {
    const c = curH.get(h); const p = prevH.get(h);
    return {
      hour: h,
      ca_ttc: c ? Number(c.ttc) : 0, ca_ht: c ? Number(c.ht) : 0,
      prev_ca_ttc: p ? Number(p.ttc) : 0, prev_ca_ht: p ? Number(p.ht) : 0,
    };
  });

  // ---- Jours de semaine (Dim..Sam) ----------------------------------------
  const curW = new Map(curWd.map((r) => [r.dow, r]));
  const prevW = new Map(prevWd.map((r) => [r.dow, r]));
  const weekdayOut = Array.from({ length: 7 }, (_, dow) => {
    const c = curW.get(dow); const p = prevW.get(dow);
    return {
      dow, label: WEEKDAYS[dow]!,
      ca_ttc: c ? Number(c.ttc) : 0, ca_ht: c ? Number(c.ht) : 0,
      prev_ca_ttc: p ? Number(p.ttc) : 0, prev_ca_ht: p ? Number(p.ht) : 0,
    };
  });

  const payments = payRows.rows
    .filter((r) => Number(r.amount) !== 0)
    .map((r) => ({ method: r.method, label: PAYMENT_LABELS[r.method] ?? r.method, amount: Number(r.amount) }));

  const tva = tvaRows.rows.map((r) => ({
    rate: Number(r.rate), base_ht: Number(r.base_ht), tva: Number(r.tva), ttc: Number(r.ttc),
  }));

  const products: ProductRow[] = prodRows.rows.map((r) => ({
    label: r.label, qty: Number(r.qty), ca_ttc: Number(r.ttc), ca_ht: Number(r.ht),
  }));

  const data: DashboardData = {
    period: { from, to },
    prevPeriod: { from: pFrom, to: pTo },
    periodLabel: fmtRange(from, to),
    prevLabel: fmtRange(pFrom, pTo),
    summary: { current: curKpi, prev: prevKpi },
    daily: {
      labels, ca_ttc, ca_ht, ticket_ttc, ticket_ht, marge,
      prev_ca_ttc, prev_ca_ht, prev_ticket_ttc, prev_ticket_ht, prev_marge,
    },
    hourly: hourlyOut,
    weekday: weekdayOut,
    payments,
    tva,
    products,
  };

  return NextResponse.json(data);
}
