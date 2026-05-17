import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';

const lineSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  variant_id: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(200),
  unit_price_ttc: z.number().min(0),
  quantity: z.number().positive(),
  discount_amount: z.number().min(0).optional(),
  tax_rate: z.number().min(0).max(100),
  tax_rate_code: z.string().min(1).max(40),
  metadata: z.record(z.unknown()).optional(),
});
const schema = z.object({ lines: z.array(lineSchema) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  // Sécurité prix : si une ligne porte un prix différent du prix catalogue produit,
  // exiger 'pos.override_price'. Les produits "price_is_free" sont autorisés.
  const productIds = parsed.data.lines
    .map((l) => l.product_id)
    .filter((x): x is string => !!x);
  if (productIds.length > 0) {
    const { rows } = await query<{ id: string; sale_price_ttc: string; price_is_free: boolean }>(
      `SELECT id, sale_price_ttc, price_is_free FROM products
        WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, productIds],
    );
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const l of parsed.data.lines) {
      if (!l.product_id) continue;
      const p = map.get(l.product_id);
      if (!p) return jsonError('PRODUCT_NOT_FOUND', 404, { product_id: l.product_id });
      if (!p.price_is_free && Math.abs(Number(p.sale_price_ttc) - l.unit_price_ttc) > 0.005) {
        if (!hasPermission(g.user.role, 'pos.override_price')) {
          return jsonError('PRICE_OVERRIDE_FORBIDDEN', 403, { product_id: l.product_id });
        }
      }
    }
  }

  try {
    const out = await SaleService.setLines(
      params.id,
      g.user.organizationId,
      parsed.data.lines,
    );
    return NextResponse.json(out);
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
