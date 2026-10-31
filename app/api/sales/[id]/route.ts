import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  // s.* + nom du vendeur / du client (la table sales ne stocke que les id) —
  // même expression que la liste du jour (app/api/sales/today/route.ts), pour
  // que « Vendeur : » et « Client : » s'affichent aussi dans le détail d'une
  // vente (ils restaient vides jusqu'ici, SELECT * ne les résolvait pas).
  const sale = await query(
    `SELECT s.*, u.full_name AS cashier,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer
       FROM sales s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1 AND s.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (sale.rowCount === 0) return jsonError('NOT_FOUND', 404);
  // Marge calculée live à partir du purchase_price_ht courant du produit.
  // (Pas figée à la vente : si le coût change, les marges historiques
  // suivent. Acceptable V1 — sinon il faudrait snapshotter dans sale_lines.)
  const lines = await query(
    `SELECT sl.*, p.purchase_price_ht::text AS product_purchase_price_ht
       FROM sale_lines sl
       LEFT JOIN products p ON p.id = sl.product_id
      WHERE sl.sale_id = $1 ORDER BY sl.line_index`,
    [params.id],
  );
  const payments = await query(
    `SELECT method, label, amount, given_amount, change_amount, reference
       FROM payments WHERE sale_id = $1 ORDER BY created_at`,
    [params.id],
  );
  // Facture rattachée : mono-vente (invoices.sale_id) OU, à défaut, facture
  // de PÉRIODE « en compte » (sales.account_invoice_id, qui regroupe plusieurs
  // ventes). On expose `period` pour nuancer l'UI.
  const monoInvoice = await query<{ id: string; number: string }>(
    `SELECT id, number FROM invoices
      WHERE sale_id = $1 AND organization_id = $2 AND status <> 'cancelled'
      ORDER BY created_at DESC LIMIT 1`,
    [params.id, g.user.organizationId],
  );
  let invoiceRow: { id: string; number: string; period: boolean } | null =
    monoInvoice.rows[0] ? { ...monoInvoice.rows[0], period: false } : null;
  const saleRow = sale.rows[0] as { account_invoice_id?: string | null };
  if (!invoiceRow && saleRow.account_invoice_id) {
    const periodInvoice = await query<{ id: string; number: string }>(
      `SELECT id, number FROM invoices
        WHERE id = $1 AND organization_id = $2 AND status <> 'cancelled'`,
      [saleRow.account_invoice_id, g.user.organizationId],
    );
    if (periodInvoice.rows[0]) invoiceRow = { ...periodInvoice.rows[0], period: true };
  }
  // Retours / avoirs liés à cette vente
  const returns = await query(
    `SELECT id, number, amount::text, used_amount::text, status, reason, created_at
       FROM credit_notes
      WHERE sale_id = $1 AND organization_id = $2
      ORDER BY created_at DESC`,
    [params.id, g.user.organizationId],
  ).catch(() => ({ rows: [] }));
  // Quantités déjà retournées par ligne (agrégées depuis les événements
  // fiscaux CREDIT_NOTE_ISSUED, qui portent le détail des lignes). Sert à
  // plafonner un nouveau retour et à désactiver le bouton si tout est rendu.
  const returnedRes = await query<{ line_index: number; qty: string }>(
    `SELECT (l->>'line_index')::int AS line_index,
            COALESCE(SUM((l->>'quantity')::numeric), 0)::text AS qty
       FROM fiscal_events fe,
            jsonb_array_elements(fe.payload->'lines') AS l
      WHERE fe.organization_id = $2
        AND fe.event_type = 'CREDIT_NOTE_ISSUED'
        AND fe.payload->>'origin_sale_id' = $1
      GROUP BY 1`,
    [params.id, g.user.organizationId],
  ).catch(() => ({ rows: [] as { line_index: number; qty: string }[] }));
  const returned_by_line: Record<number, number> = {};
  for (const r of returnedRes.rows) returned_by_line[r.line_index] = Number(r.qty);

  // Avantage fidélité (points dépensés sur CETTE vente) : sert à afficher/
  // masquer le bouton « Retirer avantage fid » — voir loyalty-reversal.ts.
  const loyaltyMoves = await query<{ movement_type: string; points_delta: string }>(
    `SELECT movement_type, points_delta::text FROM loyalty_movements
      WHERE source_type = 'sale' AND source_id = $1`,
    [params.id],
  );
  const redeemed = loyaltyMoves.rows
    .filter((r) => r.movement_type === 'redeem')
    .reduce((s, r) => s + Math.abs(Number(r.points_delta)), 0);
  const alreadyRemoved = loyaltyMoves.rows.some((r) => r.movement_type === 'adjust' && Number(r.points_delta) > 0);

  return NextResponse.json({
    sale: sale.rows[0],
    lines: lines.rows,
    payments: payments.rows,
    invoice: invoiceRow,
    returns: returns.rows,
    returned_by_line,
    loyalty: { redeemed, removable: redeemed > 0 && !alreadyRemoved },
  });
}
