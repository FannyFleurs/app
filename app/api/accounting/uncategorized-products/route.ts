import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Ce qui compose un croisement de l'écran des comptes de ventes
 * (boutique + famille + taux + période) : les articles vendus, et — pour un
 * croisement « Sans famille » — les lignes saisies au prix sans article.
 *
 * Deux usages :
 *  - « Sans famille » (category_id absent) : on liste les articles du catalogue
 *    restés sans famille (à reclasser) et les ventes sans produit (à rattacher
 *    à l'article du même nom).
 *  - croisement avec famille (category_id fourni) : on liste les articles qui le
 *    composent, avec le taux de TVA configuré sur leur fiche, pour repérer une
 *    vente passée au mauvais taux (ex. une Déco vendue à 10 % alors que sa fiche
 *    est à 20 %).
 */

interface Article {
  id: string; name: string; sku: string | null; qty: number; ht: number;
  /** Taux de TVA courant de la fiche article. Null si la fiche n'en porte pas. */
  configured_vat: number | null;
}
interface Suggestion { id: string; name: string; category_id: string | null; category_name: string | null }
interface FreeLine { label: string; qty: number; ht: number; suggestion: Suggestion | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function GET(req: Request) {
  const g = await requirePermission('accounting.read');
  if ('response' in g) return g.response;

  const url = new URL(req.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const vatRaw = url.searchParams.get('vat_rate');
  const storeId = url.searchParams.get('store_id');
  const categoryId = url.searchParams.get('category_id');
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  const vat = Number(vatRaw);
  if (vatRaw === null || Number.isNaN(vat)) {
    return NextResponse.json({ error: 'INVALID_VAT' }, { status: 400 });
  }

  // Filtre commun : même périmètre que le croisement de /accounting/coverage.
  // $1..$4 = org, from, to, vat. $5 = boutique si fournie.
  const base: unknown[] = [g.user.organizationId, from, to, vat];
  const storeFilter = storeId ? `s.store_id = $${base.push(storeId)}` : 's.store_id IS NULL';
  const where = `s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        AND ABS(sl.tax_rate - $4::numeric) < 0.005
        AND ${storeFilter}`;

  // Articles du croisement : ceux de la famille demandée, ou sans famille.
  const artParams = [...base];
  const catFilter = categoryId
    ? `p.category_id = $${artParams.push(categoryId)}`
    : 'p.category_id IS NULL';
  const prod = await query<{
    id: string; name: string; sku: string | null; configured_vat: string | null; qty: string; ht: string;
  }>(
    `SELECT p.id, p.name, p.sku, tr.rate::float8::text AS configured_vat,
            SUM(sl.quantity)::text AS qty,
            SUM(sl.line_ht)::text  AS ht
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       JOIN products p ON p.id = sl.product_id
       LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
      WHERE ${where}
        AND ${catFilter}
      GROUP BY p.id, p.name, p.sku, tr.rate
      ORDER BY SUM(sl.line_ht) DESC, p.name`,
    artParams,
  );

  const articles: Article[] = prod.rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku,
    configured_vat: r.configured_vat == null ? null : Number(r.configured_vat),
    qty: r3(Number(r.qty)), ht: r2(Number(r.ht)),
  }));

  // Les lignes sans produit n'existent que dans le croisement « Sans famille ».
  let freeLines: FreeLine[] = [];
  if (!categoryId) {
    const free = await query<{ label: string; qty: string; ht: string }>(
      `SELECT sl.label,
              SUM(sl.quantity)::text AS qty,
              SUM(sl.line_ht)::text  AS ht
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
        WHERE ${where}
          AND sl.product_id IS NULL
        GROUP BY sl.label
        ORDER BY SUM(sl.line_ht) DESC, sl.label`,
      base,
    );

    // Article du catalogue portant EXACTEMENT ce libellé : rattachement évident.
    // Un libellé porté par plusieurs articles est ambigu → aucune proposition.
    const labels = [...new Set(free.rows.map((r) => r.label.trim().toLowerCase()).filter(Boolean))];
    const byName = new Map<string, Suggestion[]>();
    if (labels.length) {
      const m = await query<{ id: string; name: string; category_id: string | null; category_name: string | null }>(
        `SELECT p.id, p.name, p.category_id, c.name AS category_name
           FROM products p
           LEFT JOIN product_categories c ON c.id = p.category_id
          WHERE p.organization_id = $1
            AND lower(btrim(p.name)) = ANY($2::text[])`,
        [g.user.organizationId, labels],
      );
      for (const r of m.rows) {
        const k = r.name.trim().toLowerCase();
        const list = byName.get(k) ?? [];
        list.push({ id: r.id, name: r.name, category_id: r.category_id, category_name: r.category_name });
        byName.set(k, list);
      }
    }

    freeLines = free.rows.map((r) => {
      const cand = byName.get(r.label.trim().toLowerCase());
      return {
        label: r.label, qty: r3(Number(r.qty)), ht: r2(Number(r.ht)),
        suggestion: cand && cand.length === 1 ? cand[0]! : null,
      };
    });
  }

  return NextResponse.json({ articles, freeLines });
}
