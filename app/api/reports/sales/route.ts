import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store_id: z.string().uuid().optional().nullable(),
});

/**
 * Rapport des ventes, jour par jour.
 *
 * Une ligne par journée de la période : chiffre d'affaires, ventilation de TVA
 * par taux, réductions, marge brute et encaissements par moyen de paiement.
 *
 * Les taux de TVA et les moyens de paiement ne sont pas figés : ils sont
 * découverts dans les données de la période, ce qui évite d'avoir à maintenir
 * une liste de colonnes en dur quand une boutique en ajoute un.
 *
 * Journée = date de validation en heure locale (Europe/Paris) : une vente de
 * 23 h 50 appartient au jour où elle a été encaissée, pas au lendemain UTC.
 */
export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const parsed = paramsSchema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    store_id: url.searchParams.get('store_id') || undefined,
  });
  if (!parsed.success) return jsonError('INVALID_PARAMS', 400);
  const { from, to, store_id: storeId } = parsed.data;

  const args: unknown[] = [g.user.organizationId, from, to];
  const storeFilter = storeId ? 'AND s.store_id = $4' : '';
  if (storeId) args.push(storeId);

  const DAY = `(s.validated_at AT TIME ZONE 'Europe/Paris')::date`;
  const SCOPE = `s.organization_id = $1
                 AND s.status = 'validated'
                 AND ${DAY} BETWEEN $2::date AND $3::date
                 ${storeFilter}`;

  /* --- Totaux par jour --- */
  const daily = await query<{
    day: string; tickets: number;
    ht: string; tva: string; ttc: string; discount: string;
  }>(
    `SELECT ${DAY}::text            AS day,
            COUNT(*)::int           AS tickets,
            SUM(s.total_ht)::text   AS ht,
            SUM(s.total_tva)::text  AS tva,
            SUM(s.total_ttc)::text  AS ttc,
            SUM(s.total_discount)::text AS discount
       FROM sales s
      WHERE ${SCOPE}
      GROUP BY ${DAY}
      ORDER BY 1 DESC`,
    args,
  );

  /* --- Ventilation de TVA, par jour et par taux --- */
  const vat = await query<{ day: string; rate: string; base_ht: string; tva: string }>(
    `SELECT ${DAY}::text AS day,
            sl.tax_rate::text AS rate,
            SUM(sl.line_ht)::text  AS base_ht,
            SUM(sl.line_tva)::text AS tva
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE ${SCOPE}
      GROUP BY 1, 2
      ORDER BY 2 DESC`,
    args,
  );

  /* --- Encaissements par moyen de paiement --- */
  const payments = await query<{ day: string; method: string; total: string }>(
    `SELECT ${DAY}::text AS day, p.method, SUM(p.amount)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE ${SCOPE}
      GROUP BY 1, 2`,
    args,
  );

  /* --- Marge brute : uniquement les lignes dont le prix d'achat est connu.
         Sans cette réserve, un article sans prix d'achat gonflerait la marge
         de 100 % et rendrait le total trompeur. --- */
  const margin = await query<{ day: string; revenue: string; cost: string; lines: number }>(
    `SELECT ${DAY}::text AS day,
            COALESCE(SUM(CASE WHEN p.purchase_price_ht > 0 THEN sl.line_ht ELSE 0 END), 0)::text AS revenue,
            COALESCE(SUM(CASE WHEN p.purchase_price_ht > 0
                              THEN p.purchase_price_ht * sl.quantity ELSE 0 END), 0)::text AS cost,
            COUNT(*) FILTER (WHERE p.purchase_price_ht > 0)::int AS lines
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
      WHERE ${SCOPE}
      GROUP BY 1`,
    args,
  );

  /* --- Avoirs émis sur la période (défalqués du chiffre d'affaires) --- */
  const creditArgs: unknown[] = [g.user.organizationId, from, to];
  const credits = await query<{ day: string; total: string }>(
    `SELECT (cn.created_at AT TIME ZONE 'Europe/Paris')::date::text AS day,
            SUM(cn.amount)::text AS total
       FROM credit_notes cn
      WHERE cn.organization_id = $1
        AND cn.status <> 'cancelled'
        AND (cn.created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2::date AND $3::date
      GROUP BY 1`,
    creditArgs,
  ).catch(() => ({ rows: [] as { day: string; total: string }[] }));

  /* --- Assemblage --- */
  const num = (v: string | undefined) => Number(v ?? 0);

  const byDay = new Map<string, {
    day: string; tickets: number; ht: number; tva: number; ttc: number;
    discount: number; margin: number; credit_notes: number;
    vat: Record<string, { base_ht: number; tva: number }>;
    payments: Record<string, number>;
  }>();

  for (const r of daily.rows) {
    byDay.set(r.day, {
      day: r.day, tickets: r.tickets,
      ht: num(r.ht), tva: num(r.tva), ttc: num(r.ttc), discount: num(r.discount),
      margin: 0, credit_notes: 0, vat: {}, payments: {},
    });
  }
  for (const r of vat.rows) {
    const d = byDay.get(r.day); if (!d) continue;
    d.vat[r.rate] = { base_ht: num(r.base_ht), tva: num(r.tva) };
  }
  for (const r of payments.rows) {
    const d = byDay.get(r.day); if (!d) continue;
    d.payments[r.method] = (d.payments[r.method] ?? 0) + num(r.total);
  }
  for (const r of margin.rows) {
    const d = byDay.get(r.day); if (!d) continue;
    d.margin = Number((num(r.revenue) - num(r.cost)).toFixed(2));
  }
  for (const r of credits.rows) {
    const d = byDay.get(r.day); if (!d) continue;
    d.credit_notes = num(r.total);
  }

  const days = [...byDay.values()];

  // Colonnes présentes dans la période, dans un ordre stable.
  const rates = [...new Set(vat.rows.map((r) => r.rate))]
    .sort((a, b) => Number(b) - Number(a));
  const methods = [...new Set(payments.rows.map((r) => r.method))].sort();

  const totals = {
    tickets: days.reduce((s, d) => s + d.tickets, 0),
    ht: round(days.reduce((s, d) => s + d.ht, 0)),
    tva: round(days.reduce((s, d) => s + d.tva, 0)),
    ttc: round(days.reduce((s, d) => s + d.ttc, 0)),
    discount: round(days.reduce((s, d) => s + d.discount, 0)),
    margin: round(days.reduce((s, d) => s + d.margin, 0)),
    credit_notes: round(days.reduce((s, d) => s + d.credit_notes, 0)),
    vat: Object.fromEntries(rates.map((r) => [r, {
      base_ht: round(days.reduce((s, d) => s + (d.vat[r]?.base_ht ?? 0), 0)),
      tva: round(days.reduce((s, d) => s + (d.vat[r]?.tva ?? 0), 0)),
    }])),
    payments: Object.fromEntries(methods.map((m) => [m,
      round(days.reduce((s, d) => s + (d.payments[m] ?? 0), 0)),
    ])),
  };

  return NextResponse.json({ days, rates, methods, totals });
}

function round(v: number): number {
  return Number(v.toFixed(2));
}
