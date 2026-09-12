import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * Détail d'une vente pour la modale de la page « Remises » (back-office,
 * lecture seule). Distinct de /api/sales/[id] (garde `pos.use`, orienté
 * caisse) : ici la garde est `settings.read`, cohérente avec la page Pilotage,
 * et on renvoie exactement ce qu'affiche la modale, motif de remise par ligne
 * inclus.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;

  const saleRes = await query<{
    receipt_number: string | null; validated_at: string; status: string;
    total_ht: string; total_tva: string; total_ttc: string; total_discount: string;
    cashier: string | null; customer: string | null; store: string | null;
  }>(
    `SELECT s.receipt_number, s.validated_at::text AS validated_at, s.status,
            s.total_ht::text, s.total_tva::text, s.total_ttc::text, s.total_discount::text,
            u.full_name AS cashier,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), '')) AS customer,
            st.name AS store
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN stores st ON st.id = s.store_id
      WHERE s.id = $1 AND s.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (saleRes.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const linesRes = await query<{
    label: string; quantity: string; unit_price_ttc: string;
    discount_amount: string; line_ttc: string; tax_rate: string;
    cart_reason: string | null; line_reason: string | null;
  }>(
    `SELECT label, quantity::text, unit_price_ttc::text, discount_amount::text,
            line_ttc::text, tax_rate::text,
            NULLIF(metadata->>'cart_discount_reason', '') AS cart_reason,
            NULLIF(metadata->>'manual_discount_reason', '') AS line_reason
       FROM sale_lines
      WHERE sale_id = $1
      ORDER BY line_index`,
    [params.id],
  );

  const paymentsRes = await query<{ method: string; amount: string }>(
    `SELECT method, amount::text FROM payments WHERE sale_id = $1 ORDER BY created_at`,
    [params.id],
  );

  return NextResponse.json({
    sale: saleRes.rows[0],
    lines: linesRes.rows.map((l) => ({
      label: l.label,
      quantity: Number(l.quantity),
      unit_price_ttc: Number(l.unit_price_ttc),
      discount_amount: Number(l.discount_amount),
      line_ttc: Number(l.line_ttc),
      tax_rate: Number(l.tax_rate),
      motif: l.cart_reason ?? l.line_reason ?? null,
    })),
    payments: paymentsRes.rows.map((p) => ({ method: p.method, amount: Number(p.amount) })),
  });
}
