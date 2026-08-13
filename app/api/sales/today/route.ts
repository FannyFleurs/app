import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { resolveDeviceStoreId } from '@/lib/pos/current-store';
import { depositReasonSql } from '@/lib/services/cash-deposit';

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const date = url.searchParams.get('date'); // YYYY-MM-DD, défaut aujourd'hui
  const scan = url.searchParams.get('scan')?.trim();

  // Isolation multi-boutiques : sur un poste de caisse appairé, on ne montre
  // QUE la journée de la boutique du poste. Null (poste non appairé /
  // back-office) => toutes boutiques (comportement historique).
  const storeId = await resolveDeviceStoreId(g.user.organizationId);

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
        AND ($3::uuid IS NULL OR s.store_id = $3)
      ORDER BY s.validated_at DESC`,
    [g.user.organizationId, date, storeId],
  );

  // Retours / avoirs émis CE jour (défalqués du CA de la journée). Le nombre
  // compte autant que le montant : un avoir est un ticket émis, il figure au
  // compteur de tickets de la journée.
  const returnsRes = await query<{ total: string; cnt: string }>(
    `SELECT COALESCE(SUM(cn.amount), 0)::text AS total, COUNT(*)::text AS cnt
       FROM credit_notes cn
      WHERE cn.organization_id = $1
        AND cn.status <> 'cancelled'
        AND cn.created_at::date = COALESCE($2::date, CURRENT_DATE)
        AND ($3::uuid IS NULL OR cn.sale_id IN (
              SELECT id FROM sales WHERE store_id = $3))`,
    [g.user.organizationId, date, storeId],
  ).catch(() => ({ rows: [{ total: '0', cnt: '0' }] }));

  // Cash summary du jour : ventes espèces, remises en banque, espèces attendues.
  const cashSalesRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(p.amount), 0)::text AS total
       FROM payments p
       JOIN sales s ON s.id = p.sale_id
      WHERE s.organization_id = $1
        AND s.status = 'validated'
        AND s.validated_at::date = COALESCE($2::date, CURRENT_DATE)
        AND ($3::uuid IS NULL OR s.store_id = $3)
        AND p.method = 'cash'`,
    [g.user.organizationId, date, storeId],
  );
  const depositsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = COALESCE($2::date, CURRENT_DATE)
        AND ($3::uuid IS NULL OR cs.store_id = $3)
        AND cm.movement_type = 'out'
        AND ${depositReasonSql('cm.reason')}`,
    [g.user.organizationId, date, storeId],
  );
  // Remboursements espèces du jour (retours) : sortent du tiroir eux aussi.
  const cashRefundsRes = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cm.amount), 0)::text AS total
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = COALESCE($2::date, CURRENT_DATE)
        AND ($3::uuid IS NULL OR cs.store_id = $3)
        AND cm.movement_type = 'out'
        AND cm.reason ILIKE 'Remboursement%'`,
    [g.user.organizationId, date, storeId],
  ).catch(() => ({ rows: [{ total: '0' }] }));
  // Fond de caisse et mouvements du jour : ce sont eux qui font la différence
  // entre « ce qu'on a encaissé » et « ce qu'il doit y avoir dans le tiroir ».
  // Mêmes bornes que le rapport Z (sessions ouvertes ce jour-là), sinon les
  // deux écrans annonceraient deux montants attendus différents.
  const floatRes = await query<{ opening: string; ins: string; outs: string }>(
    `SELECT COALESCE(SUM(cs.opening_float), 0)::text AS opening,
            COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                       WHERE cm.cash_session_id IN (SELECT id FROM cash_sessions
                              WHERE organization_id = $1
                                AND opened_at::date = COALESCE($2::date, CURRENT_DATE)
                                AND ($3::uuid IS NULL OR store_id = $3))
                         AND cm.movement_type = 'in'), 0)::text AS ins,
            COALESCE((SELECT SUM(cm.amount) FROM cash_movements cm
                       WHERE cm.cash_session_id IN (SELECT id FROM cash_sessions
                              WHERE organization_id = $1
                                AND opened_at::date = COALESCE($2::date, CURRENT_DATE)
                                AND ($3::uuid IS NULL OR store_id = $3))
                         AND cm.movement_type = 'out'), 0)::text AS outs
       FROM cash_sessions cs
      WHERE cs.organization_id = $1
        AND cs.opened_at::date = COALESCE($2::date, CURRENT_DATE)
        AND ($3::uuid IS NULL OR cs.store_id = $3)`,
    [g.user.organizationId, date, storeId],
  ).catch(() => ({ rows: [{ opening: '0', ins: '0', outs: '0' }] }));

  const cashSales = Number(cashSalesRes.rows[0]?.total ?? 0);
  const bankDeposits = Number(depositsRes.rows[0]?.total ?? 0);
  const cashRefunds = Number(cashRefundsRes.rows[0]?.total ?? 0);
  const openingFloat = Number(floatRes.rows[0]?.opening ?? 0);
  const cashIn = Number(floatRes.rows[0]?.ins ?? 0);
  const cashOut = Number(floatRes.rows[0]?.outs ?? 0);

  // Heure d'ouverture de la caisse pour ce jour :
  //  - en priorité, la 1re session ouverte CE jour-là (fonds de caisse du matin) ;
  //  - sinon (caisse ouverte un jour précédent et restée ouverte), l'ouverture
  //    de la session encore ouverte qui couvre ce jour.
  // On renvoie une vraie Date (→ ISO) et non ::text, pour un parsing fiable
  // côté navigateur (Safari).
  const openRes = await query<{ opened_at: Date | null }>(
    `SELECT COALESCE(
        (SELECT MIN(opened_at) FROM cash_sessions
          WHERE organization_id = $1
            AND opened_at::date = COALESCE($2::date, CURRENT_DATE)
            AND ($3::uuid IS NULL OR store_id = $3)),
        (SELECT opened_at FROM cash_sessions
          WHERE organization_id = $1 AND status = 'open'
            AND opened_at::date <= COALESCE($2::date, CURRENT_DATE)
            AND ($3::uuid IS NULL OR store_id = $3)
          ORDER BY opened_at DESC LIMIT 1)
      ) AS opened_at`,
    [g.user.organizationId, date, storeId],
  ).catch(() => ({ rows: [{ opened_at: null }] }));

  return NextResponse.json({
    sales: rows,
    returns_total: Number(returnsRes.rows[0]?.total ?? 0),
    returns_count: Number(returnsRes.rows[0]?.cnt ?? 0),
    opened_at: openRes.rows[0]?.opened_at ?? null,
    cash_summary: {
      opening_float: openingFloat,
      cash_sales: cashSales,
      bank_deposits: bankDeposits,
      cash_refunds: cashRefunds,
      cash_in: cashIn,
      cash_out: cashOut,
      // Contenu attendu du tiroir, à la pièce près : le fond du matin, plus
      // les espèces encaissées, plus/moins les mouvements. Même formule que
      // la clôture — c'est ce montant que le comptage vient confronter.
      expected_cash: Number((openingFloat + cashSales + cashIn - cashOut).toFixed(2)),
    },
  });
}
