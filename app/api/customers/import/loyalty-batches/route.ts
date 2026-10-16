import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';

export const dynamic = 'force-dynamic';

/** Deux mouvements à plus de 30 min d'écart = deux imports distincts. */
const BATCH_GAP_MS = 30 * 60 * 1000;

interface Row {
  id: string;
  points_delta: string;
  created_at: string;
  customer_name: string;
}

interface Batch {
  started_at: string;
  ended_at: string;
  count: number;
  total_points: number;
  sample_customers: string[];
}

/**
 * Liste les imports de points de fidélité (source_type='import') non encore
 * annulés, groupés en lots par proximité temporelle — un import en masse
 * crée une rafale de mouvements sur quelques secondes/minutes, deux imports
 * distincts sont normalement séparés de bien plus que ça.
 *
 * Sert à l'écran de correction (CustomerLoyaltyRevertModal) : l'utilisateur
 * choisit QUEL lot annuler, plutôt qu'un bouton aveugle "tout annuler" — un
 * mauvais import peut être suivi d'imports légitimes qu'il ne faut pas toucher.
 */
export async function GET() {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;

  const { rows } = await query<Row>(
    `SELECT lm.id, lm.points_delta::text, lm.created_at::text,
            COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), ''), '—') AS customer_name
       FROM loyalty_movements lm
       JOIN loyalty_accounts la ON la.id = lm.account_id
       JOIN customers c ON c.id = la.customer_id
      WHERE lm.organization_id = $1 AND lm.source_type = 'import'
        AND NOT EXISTS (
          SELECT 1 FROM loyalty_movements r
           WHERE r.source_type = 'import_revert' AND r.source_id = lm.id
        )
      ORDER BY lm.created_at ASC`,
    [g.user.organizationId],
  );

  const batches: Batch[] = [];
  let current: Row[] = [];
  for (const r of rows) {
    const prev = current[current.length - 1];
    if (prev && new Date(r.created_at).getTime() - new Date(prev.created_at).getTime() > BATCH_GAP_MS) {
      batches.push(summarize(current));
      current = [];
    }
    current.push(r);
  }
  if (current.length > 0) batches.push(summarize(current));

  return NextResponse.json({ batches: batches.reverse() }); // plus récent d'abord
}

function summarize(rows: Row[]): Batch {
  return {
    started_at: rows[0]!.created_at,
    ended_at: rows[rows.length - 1]!.created_at,
    count: rows.length,
    total_points: Number(rows.reduce((s, r) => s + Number(r.points_delta), 0).toFixed(2)),
    sample_customers: [...new Set(rows.map((r) => r.customer_name))].slice(0, 5),
  };
}
