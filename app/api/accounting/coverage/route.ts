import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { resolveSalesAccount, type SalesAccountRule } from '@/lib/services/accounting-mapping';

export const dynamic = 'force-dynamic';

/**
 * Croisements réellement vendus sur une période, et le compte qui leur est
 * appliqué — ou rien.
 *
 * Sans cette vue, on paramètre à l'aveugle : l'export retombe sur le compte de
 * ventes global pour tout ce qui n'a pas de règle, et il faut relire le CSV
 * ligne à ligne pour comprendre ce qui manque. Ici, ce qui manque se lit
 * d'abord, avec le chiffre d'affaires en jeu pour savoir par quoi commencer.
 */

interface Crossing {
  store_id: string | null;
  store_name: string | null;
  category_id: string | null;
  category_name: string | null;
  vat_rate: number;
  ht: number;
  account_code: string | null;
  account_label: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const g = await requirePermission('accounting.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  const storeIds = (url.searchParams.get('store_ids') ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const storeFilter = storeIds.length ? ' AND s.store_id = ANY($4::uuid[])' : '';
  const storeArgs: unknown[] = storeIds.length ? [storeIds] : [];

  // Même regroupement que l'export « Ventes par compte » : ce qui apparaît ici
  // est exactement ce qui produira une ligne là-bas.
  const lines = await query<{
    store_id: string | null; store_name: string | null;
    category_id: string | null; category_name: string | null;
    vat_rate: string; ht: string;
  }>(
    `SELECT s.store_id, st.name AS store_name,
            p.category_id, c.name AS category_name,
            sl.tax_rate::text AS vat_rate,
            SUM(sl.line_ht)::text AS ht
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        -- Émission d'un bon d'achat / carte cadeau : ce n'est pas une vente
        -- taxable (0 € HT), c'est une dette « à honorer ». Elle a son propre
        -- compte, hors ventilation des ventes.
        AND sl.metadata->>'gift_card' IS DISTINCT FROM 'true'
        ${storeFilter}
      GROUP BY s.store_id, st.name, p.category_id, c.name, sl.tax_rate`,
    [g.user.organizationId, from, to, ...storeArgs],
  );

  const rules = await query<SalesAccountRule>(
    `SELECT id, store_id, category_id, vat_rate::float8 AS vat_rate,
            account_code, account_label, vat_account_code, vat_account_label
       FROM accounting_sales_accounts
      WHERE organization_id = $1`,
    [g.user.organizationId],
  );

  const crossings: Crossing[] = lines.rows.map((r) => {
    const scope = {
      store_id: r.store_id, category_id: r.category_id, vat_rate: Number(r.vat_rate),
    };
    const rule = resolveSalesAccount(rules.rows, scope);
    return {
      ...scope,
      store_name: r.store_name, category_name: r.category_name,
      ht: Math.round(Number(r.ht) * 100) / 100,
      account_code: rule?.account_code ?? null,
      account_label: rule?.account_label ?? null,
    };
  })
    // Les manquants d'abord, puis le plus gros chiffre d'affaires : l'ordre
    // dans lequel on a intérêt à traiter la liste.
    .sort((a, b) => Number(!!a.account_code) - Number(!!b.account_code) || b.ht - a.ht);

  return NextResponse.json({ crossings });
}
