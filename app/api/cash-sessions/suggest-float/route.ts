import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { loadOpeningFloat } from '@/lib/settings/opening-float-server';

/**
 * Suggère un fond de caisse à l'ouverture, selon le mode configuré POUR LA
 * BOUTIQUE du poste :
 *   - manual          → 0 (l'utilisateur saisit)
 *   - fixed           → montant fixe de la boutique
 *   - previous_close  → counted_cash de la dernière session fermée du poste
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const registerId = url.searchParams.get('register_id');
  const storeId = url.searchParams.get('store_id') || undefined;
  if (!registerId) return jsonError('register_id requis', 400);

  const cfg = await loadOpeningFloat(g.user.organizationId, storeId);

  if (cfg.mode === 'fixed') {
    return NextResponse.json({ mode: 'fixed', amount: cfg.amount });
  }

  if (cfg.mode === 'previous_close') {
    const prev = await query<{ counted_cash: string | null }>(
      `SELECT counted_cash FROM cash_sessions
        WHERE register_id = $1 AND status = 'closed'
          AND counted_cash IS NOT NULL
        ORDER BY closed_at DESC LIMIT 1`,
      [registerId],
    );
    const amount = prev.rows[0]?.counted_cash != null ? Number(prev.rows[0].counted_cash) : null;
    return NextResponse.json({
      mode: 'previous_close',
      amount,
      fallback: cfg.amount,
    });
  }

  return NextResponse.json({ mode: 'manual', amount: 0 });
}
