import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const date = url.searchParams.get('date'); // YYYY-MM-DD, défaut aujourd'hui
  const scan = url.searchParams.get('scan')?.trim();

  // Recherche par scan : si un numéro de ticket est fourni, on filtre directement
  // dessus, sans restreindre par date (utile pour scanner un ancien ticket).
  if (scan) {
    const { rows } = await query(
      `SELECT s.id, s.receipt_number, s.total_ttc::text, s.total_ht::text,
              s.total_tva::text, s.total_discount::text, s.validated_at,
              s.status, s.fiscal_hash,
              u.full_name AS cashier,
              COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer,
              COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn
                         WHERE cn.sale_id = s.id AND cn.status <> 'cancelled'), 0)::text AS refunded_total
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.organization_id = $1
          AND s.status IN ('validated', 'cancelled_by_credit_note')
          AND s.receipt_number = $2
        LIMIT 1`,
      [g.user.organizationId, scan],
    );
    return NextResponse.json({ sales: rows });
  }

  // On liste aussi les ventes annulées par avoir (retour total) : elles
  // doivent rester visibles dans la journée, marquées « Annulée », au lieu
  // de disparaître. refunded_total = somme des avoirs émis sur la vente.
  const { rows } = await query(
    `SELECT s.id, s.receipt_number, s.total_ttc::text, s.total_ht::text,
            s.total_tva::text, s.total_discount::text, s.validated_at,
            s.status, s.fiscal_hash,
            u.full_name AS cashier,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer,
            COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn
                       WHERE cn.sale_id = s.id AND cn.status <> 'cancelled'), 0)::text AS refunded_total
       FROM sales s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.organization_id = $1
        AND s.status IN ('validated', 'cancelled_by_credit_note')
        AND s.validated_at::date = COALESCE($2::date, CURRENT_DATE)
      ORDER BY s.validated_at DESC`,
    [g.user.organizationId, date],
  );

  // Retours / avoirs émis CE jour (défalqués du CA de la journée).
  const returnsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM credit_notes
      WHERE organization_id = $1
        AND status <> 'cancelled'
        AND created_at::date = COALESCE($2::date, CURRENT_DATE)`,
    [g.user.organizationId, date],
  ).catch(() => ({ rows: [{ total: '0' }] }));

  // Cash summary du jour : ventes espèces, remises en banque, espèces attendues.
  const cashSalesRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(p.amount), 0)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date = COALESCE($2::date, CURRENT_DATE)
        AND p.method = 'cash'`,
    [g.user.organizationId, date],
  );
  const depositsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = COALESCE($2::date, CURRENT_DATE)
        AND cm.movement_type = 'out'
        AND cm.reason ILIKE '%banque%'`,
    [g.user.organizationId, date],
  );
  // Remboursements espèces du jour (retours) : sortent du tiroir eux aussi.
  const cashRefundsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = COALESCE($2::date, CURRENT_DATE)
        AND cm.movement_type = 'out'
        AND cm.reason ILIKE 'Remboursement%'`,
    [g.user.organizationId, date],
  ).catch(() => ({ rows: [{ total: '0' }] }));
  const cashSales = Number(cashSalesRes.rows[0]?.total ?? 0);
  const bankDeposits = Number(depositsRes.rows[0]?.total ?? 0);
  const cashRefunds = Number(cashRefundsRes.rows[0]?.total ?? 0);

  // Heure d'ouverture de la caisse : première session ouverte ce jour-là.
  const openRes = await query<{ opened_at: string | null }>(
    `SELECT MIN(opened_at)::text AS opened_at
       FROM cash_sessions
      WHERE organization_id = $1
        AND opened_at::date = COALESCE($2::date, CURRENT_DATE)`,
    [g.user.organizationId, date],
  ).catch(() => ({ rows: [{ opened_at: null }] }));

  return NextResponse.json({
    sales: rows,
    returns_total: Number(returnsRes.rows[0]?.total ?? 0),
    opened_at: openRes.rows[0]?.opened_at ?? null,
    cash_summary: {
      cash_sales: cashSales,
      bank_deposits: bankDeposits,
      cash_refunds: cashRefunds,
      expected_cash: Number((cashSales - bankDeposits - cashRefunds).toFixed(2)),
    },
  });
}
