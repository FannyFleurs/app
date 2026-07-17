import { query } from '@/lib/db/client';

/**
 * Rapport de journée (Z scellé ou X en cours), au format « Récapitulatif ».
 * Une seule agrégation partagée pour garantir un Z et un X identiques.
 * Tous les chiffres issus des ventes sont calculés en direct pour la
 * boutique + date ; le comptage espèces (Z) provient de la clôture scellée.
 */

export interface DayReportIdentity {
  name: string;
  legal_name: string | null;
  line1: string | null;
  line2: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  siret: string | null;
  siren: string | null;
  vat_number: string | null;
  website: string | null;
}

export interface DayReport {
  kind: 'Z' | 'X';
  identity: DayReportIdentity;
  store_name: string;
  journee_number: number | null;
  opened_at: string | null;
  closed_at: string | null;
  printed_at: string;
  closed_by: string | null;
  fiscal_hash: string | null;
  totals: {
    ca_ttc: number;
    ca_ht: number;
    ca_tva: number;
    ticket_count: number;
    ticket_moyen_ttc: number;
    marge_brute_ht: number | null;
    discounts_total: number;
    offerts_count: number;
    offerts_total: number;
  };
  tva_by_rate: { rate: number; tva: number; ttc: number; ht: number }[];
  payments: { method: string; count: number; amount: number }[];
  cash: {
    fonds_de_caisse: number;
    entrees_argent: number;
    total_espece_fermeture: number;
    tiroir_sans_ticket: number;
    counted: number | null;
    variance: number | null;
  };
  by_vendor: { name: string; ca_ttc: number }[];
  by_category: { name: string; ca_ttc: number }[];
  by_mode: { mode: string; ca_ttc: number }[];
  tickets: { normal_count: number; normal_total: number };
}

const MODE_LABELS: Record<string, string> = {
  delivery: 'Livraison',
  pickup: 'À emporter',
  sur_place: 'Sur place',
};

export async function computeDayReport(opts: {
  organizationId: string;
  storeId: string;
  businessDate: string; // YYYY-MM-DD
  kind: 'Z' | 'X';
  printedAt: string; // ISO
  sealed?: {
    closed_by: string | null;
    sealed_at: string | null;
    fiscal_hash: string | null;
    cash_counted: number | null;
    cash_variance: number | null;
    cash_expected: number | null;
  };
}): Promise<DayReport> {
  const { organizationId: org, storeId: store, businessDate: date } = opts;
  const P = [org, store, date] as const;

  const [ident, totalsR, tvaR, payR, vendorR, catR, modeR, marginR, floatsR, sessR, jnR] =
    await Promise.all([
      query<{ name: string; legal_name: string | null; siret: string | null; siren: string | null; vat_number: string | null; address: Record<string, string> | null; contact: Record<string, string> | null; store_name: string }>(
        `SELECT o.name, o.legal_name, o.siret, o.siren, o.vat_number, o.address, o.contact,
                s.name AS store_name
           FROM organizations o JOIN stores s ON s.id = $2
          WHERE o.id = $1`, [org, store]),
      query<{ cnt: string; ht: string; tva: string; ttc: string; disc: string }>(
        `SELECT COUNT(*)::text cnt, COALESCE(SUM(total_ht),0)::text ht,
                COALESCE(SUM(total_tva),0)::text tva, COALESCE(SUM(total_ttc),0)::text ttc,
                COALESCE(SUM(total_discount),0)::text disc
           FROM sales WHERE store_id=$2 AND organization_id=$1
             AND status='validated' AND validated_at::date=$3::date`, [...P]),
      query<{ tax_rate: string; ht: string; tva: string; ttc: string }>(
        `SELECT sl.tax_rate::text, SUM(sl.line_ht)::text ht, SUM(sl.line_tva)::text tva, SUM(sl.line_ttc)::text ttc
           FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date
          GROUP BY sl.tax_rate ORDER BY sl.tax_rate`, [...P]),
      query<{ method: string; cnt: string; total: string }>(
        `SELECT p.method, COUNT(*)::text cnt, SUM(p.amount)::text total
           FROM payments p JOIN sales s ON s.id=p.sale_id
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date
          GROUP BY p.method ORDER BY SUM(p.amount) DESC`, [...P]),
      query<{ name: string; ttc: string }>(
        `SELECT COALESCE(u.full_name,'—') name, SUM(s.total_ttc)::text ttc
           FROM sales s LEFT JOIN users u ON u.id=s.user_id
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date
          GROUP BY u.full_name ORDER BY SUM(s.total_ttc) DESC`, [...P]),
      query<{ name: string; ttc: string }>(
        `SELECT COALESCE(c.name,'Sans catégorie') name, SUM(sl.line_ttc)::text ttc
           FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id
           LEFT JOIN products p ON p.id=sl.product_id
           LEFT JOIN product_categories c ON c.id=p.category_id
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date
          GROUP BY COALESCE(c.name,'Sans catégorie') ORDER BY name`, [...P]),
      query<{ mode: string | null; ttc: string }>(
        `SELECT s.delivery_info->>'pickup_or_delivery' mode, SUM(s.total_ttc)::text ttc
           FROM sales s
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date
          GROUP BY s.delivery_info->>'pickup_or_delivery'`, [...P]),
      query<{ revenue: string; cost: string; lines_with_cost: string }>(
        `SELECT COALESCE(SUM(CASE WHEN p.purchase_price_ht>0 THEN sl.line_ht ELSE 0 END),0)::text revenue,
                COALESCE(SUM(CASE WHEN p.purchase_price_ht>0 THEN p.purchase_price_ht*sl.quantity ELSE 0 END),0)::text cost,
                COUNT(*) FILTER (WHERE p.purchase_price_ht>0)::text lines_with_cost
           FROM sale_lines sl JOIN sales s ON s.id=sl.sale_id
           LEFT JOIN products p ON p.id=sl.product_id
          WHERE s.store_id=$2 AND s.organization_id=$1 AND s.status='validated' AND s.validated_at::date=$3::date`, [...P]),
      query<{ opening: string; ins: string; outs: string }>(
        `SELECT COALESCE(SUM(cs.opening_float),0)::text opening,
                COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.cash_session_id IN
                          (SELECT id FROM cash_sessions WHERE store_id=$2 AND opened_at::date=$3::date) AND cm.movement_type='in'),0)::text ins,
                COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm WHERE cm.cash_session_id IN
                          (SELECT id FROM cash_sessions WHERE store_id=$2 AND opened_at::date=$3::date) AND cm.movement_type='out'),0)::text outs
           FROM cash_sessions cs WHERE cs.organization_id=$1 AND cs.store_id=$2 AND cs.opened_at::date=$3::date`, [...P]),
      query<{ opened_at: string | null; closed_at: string | null }>(
        `SELECT MIN(opened_at)::text opened_at, MAX(closed_at)::text closed_at
           FROM cash_sessions WHERE organization_id=$1 AND store_id=$2 AND opened_at::date=$3::date`, [...P]),
      query<{ n: string }>(
        `SELECT COUNT(*)::text n FROM daily_closures WHERE organization_id=$1 AND store_id=$2 AND business_date < $3::date`, [...P]),
    ]);

  const idRow = ident.rows[0];
  const addr = idRow?.address ?? {};
  const contact = idRow?.contact ?? {};
  const identity: DayReportIdentity = {
    name: idRow?.name ?? '',
    legal_name: idRow?.legal_name ?? null,
    line1: addr.line1 ?? null,
    line2: addr.line2 ?? null,
    zip: addr.zip ?? null,
    city: addr.city ?? null,
    country: addr.country ?? null,
    phone: contact.phone ?? null,
    siret: idRow?.siret ?? null,
    siren: idRow?.siren ?? null,
    vat_number: idRow?.vat_number ?? null,
    website: contact.website ?? null,
  };

  const t = totalsR.rows[0]!;
  const ticketCount = Number(t.cnt);
  const caTtc = Number(t.ttc);
  const revenue = Number(marginR.rows[0]?.revenue ?? 0);
  const cost = Number(marginR.rows[0]?.cost ?? 0);
  const linesWithCost = Number(marginR.rows[0]?.lines_with_cost ?? 0);

  const openingFloats = Number(floatsR.rows[0]?.opening ?? 0);
  const cashIns = Number(floatsR.rows[0]?.ins ?? 0);
  const cashOuts = Number(floatsR.rows[0]?.outs ?? 0);
  const cashSales = Number(payR.rows.find((p) => p.method === 'cash')?.total ?? 0);
  const cashExpected = opts.sealed?.cash_expected != null
    ? opts.sealed.cash_expected
    : Number((openingFloats + cashSales + cashIns - cashOuts).toFixed(2));

  // Modes de vente : regroupe null → sur_place.
  const modeMap = new Map<string, number>();
  for (const r of modeR.rows) {
    const key = r.mode || 'sur_place';
    modeMap.set(key, (modeMap.get(key) ?? 0) + Number(r.ttc));
  }

  return {
    kind: opts.kind,
    identity,
    store_name: idRow?.store_name ?? '',
    journee_number: Number(jnR.rows[0]?.n ?? 0) + 1,
    opened_at: sessR.rows[0]?.opened_at ?? null,
    closed_at: opts.kind === 'Z' ? (opts.sealed?.sealed_at ?? sessR.rows[0]?.closed_at ?? null) : null,
    printed_at: opts.printedAt,
    closed_by: opts.sealed?.closed_by ?? null,
    fiscal_hash: opts.sealed?.fiscal_hash ?? null,
    totals: {
      ca_ttc: caTtc,
      ca_ht: Number(t.ht),
      ca_tva: Number(t.tva),
      ticket_count: ticketCount,
      ticket_moyen_ttc: ticketCount > 0 ? Number((caTtc / ticketCount).toFixed(2)) : 0,
      marge_brute_ht: linesWithCost > 0 ? Number((revenue - cost).toFixed(2)) : null,
      discounts_total: Number(t.disc),
      offerts_count: 0,
      offerts_total: 0,
    },
    tva_by_rate: tvaR.rows.map((r) => ({
      rate: Number(r.tax_rate), ht: Number(r.ht), tva: Number(r.tva), ttc: Number(r.ttc),
    })),
    payments: payR.rows.map((r) => ({ method: r.method, count: Number(r.cnt), amount: Number(r.total) })),
    cash: {
      fonds_de_caisse: openingFloats,
      entrees_argent: cashIns,
      total_espece_fermeture: cashExpected,
      tiroir_sans_ticket: 0,
      counted: opts.sealed?.cash_counted ?? null,
      variance: opts.sealed?.cash_variance ?? null,
    },
    by_vendor: vendorR.rows.map((r) => ({ name: r.name, ca_ttc: Number(r.ttc) })),
    by_category: catR.rows.map((r) => ({ name: r.name, ca_ttc: Number(r.ttc) })),
    by_mode: Array.from(modeMap.entries())
      .map(([mode, ttc]) => ({ mode: MODE_LABELS[mode] ?? 'Sur place', ca_ttc: ttc }))
      .sort((a, b) => b.ca_ttc - a.ca_ttc),
    tickets: { normal_count: ticketCount, normal_total: caTtc },
  };
}
