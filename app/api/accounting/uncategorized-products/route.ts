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
interface FreeLine { label: string; qty: number; ht: number }

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
  const freeLines: FreeLine[] = free.rows.map((r) => ({
    label: r.label, qty: r3(Number(r.qty)), ht: r2(Number(r.ht)),
  }));

  return NextResponse.json({ articles, freeLines });
}
