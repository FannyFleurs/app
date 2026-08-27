import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/**
 * Articles sans famille vendus dans un croisement « Sans famille » précis
 * (boutique + taux + période).
 *
 * Le croisement « Sans famille » de l'écran des comptes de ventes n'est pas un
 * cas comptable à paramétrer : c'est un oubli de saisie. Un produit devrait
 * toujours porter une famille. Cette route liste les articles concernés pour
 * qu'on leur en attribue une après coup (PATCH /api/products/[id]) ; le
 * croisement disparaît alors de lui-même, la vente rejoignant sa famille.
 */

interface Article {
  id: string;
  name: string;
  sku: string | null;
  qty: number;
  ht: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

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

  // Même périmètre que le croisement « Sans famille » de /accounting/coverage :
  // articles réellement vendus (produit rattaché, sans famille) sur la période,
  // la boutique et le taux donnés. Les lignes sans produit (saisie libre) ne
  // peuvent pas recevoir de famille : on ne les liste pas.
  const { rows } = await query<{ id: string; name: string; sku: string | null; qty: string; ht: string }>(
    `SELECT p.id, p.name, p.sku,
            SUM(sl.quantity)::text AS qty,
            SUM(sl.line_ht)::text  AS ht
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       JOIN products p ON p.id = sl.product_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date BETWEEN $2::date AND $3::date
        AND p.category_id IS NULL
        AND ABS(sl.tax_rate - $4::numeric) < 0.005
        AND ${storeFilter}
      GROUP BY p.id, p.name, p.sku
      ORDER BY SUM(sl.line_ht) DESC, p.name`,
    params,
  );

  const articles: Article[] = rows.map((r) => ({
    id: r.id, name: r.name, sku: r.sku,
    qty: Math.round(Number(r.qty) * 1000) / 1000,
    ht: Math.round(Number(r.ht) * 100) / 100,
  }));

  return NextResponse.json({ articles });
}
