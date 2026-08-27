import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Ce qui compose un croisement « Sans famille » (boutique + taux + période).
 *
 * Deux populations s'y mélangent, et il faut les distinguer pour comprendre :
 *  - des ARTICLES du catalogue sans famille : un oubli de saisie. On leur en
 *    attribue une (PATCH /api/products/[id]) et la vente rejoint sa famille.
 *  - des lignes SANS produit (vente au montant libre) : elles n'ont qu'un
 *    libellé, aucune famille possible. On les liste en lecture pour montrer
 *    d'où vient le chiffre d'affaires resté sans famille.
 */

interface Article { id: string; name: string; sku: string | null; qty: number; ht: number }
/** Article du catalogue portant exactement ce libellé, proposé au rattachement. */
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
  if (!DATE.test(from) || !DATE.test(to) || to < from) {
    return NextResponse.json({ error: 'INVALID_PERIOD' }, { status: 400 });
  }
  const vat = Number(vatRaw);
  if (vatRaw === null || Number.isNaN(vat)) {
    return NextResponse.json({ error: 'INVALID_VAT' }, { status: 400 });
  }

  // La boutique du croisement peut être nulle (vente sans boutique) : on
  // distingue « cette boutique » de « sans boutique » plutôt que de tout mêler.
  const storeFilter = storeId ? 's.store_id = $5' : 's.store_id IS NULL';
  const params: unknown[] = [g.user.organizationId, from, to, vat];
  if (storeId) params.push(storeId);

  // Filtre commun aux deux requêtes : même périmètre que le croisement
  // « Sans famille » de /accounting/coverage.
  const where = `s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        AND ABS(sl.tax_rate - $4::numeric) < 0.005
        AND ${storeFilter}`;

  const [prod, free] = await Promise.all([
    // Articles du catalogue vendus ici et restés sans famille : reclassables.
    query<{ id: string; name: string; sku: string | null; qty: string; ht: string }>(
      `SELECT p.id, p.name, p.sku,
              SUM(sl.quantity)::text AS qty,
              SUM(sl.line_ht)::text  AS ht
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         JOIN products p ON p.id = sl.product_id
        WHERE ${where}
          AND p.category_id IS NULL
        GROUP BY p.id, p.name, p.sku
        ORDER BY SUM(sl.line_ht) DESC, p.name`,
      params,
    ),
    // Lignes sans produit (vente libre) : regroupées par libellé, en lecture.
    query<{ label: string; qty: string; ht: string }>(
      `SELECT sl.label,
              SUM(sl.quantity)::text AS qty,
              SUM(sl.line_ht)::text  AS ht
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
        WHERE ${where}
          AND sl.product_id IS NULL
        GROUP BY sl.label
        ORDER BY SUM(sl.line_ht) DESC, sl.label`,
      params,
    ),
  ]);

  const articles: Article[] = prod.rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku, qty: r3(Number(r.qty)), ht: r2(Number(r.ht)),
  }));

  // Pour chaque ligne libre, on cherche l'article du catalogue portant EXACTEMENT
  // ce libellé (à la casse près). C'est le rattachement évident, celui que l'on
  // proposera en un clic. Un libellé porté par plusieurs articles est ambigu :
  // on ne propose alors rien plutôt que de deviner.
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

  const freeLines: FreeLine[] = free.rows.map((r) => {
    const cand = byName.get(r.label.trim().toLowerCase());
    return {
      label: r.label, qty: r3(Number(r.qty)), ht: r2(Number(r.ht)),
      suggestion: cand && cand.length === 1 ? cand[0]! : null,
    };
  });

  return NextResponse.json({ articles, freeLines });
}
