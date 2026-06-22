import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';

/**
 * Suggère un fond de caisse à l'ouverture, selon le mode configuré :
 *   - manual          → 0 (l'utilisateur saisit)
 *   - fixed           → settings.opening_float_amount
 *   - previous_close  → counted_cash de la dernière session fermée
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const registerId = new URL(req.url).searchParams.get('register_id');
  if (!registerId) return jsonError('register_id requis', 400);

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const cfg = mergeWithDefaults(rows[0]?.value ?? null);

  if (cfg.opening_float_mode === 'fixed') {
    return NextResponse.json({ mode: 'fixed', amount: cfg.opening_float_amount });
  }

  if (cfg.opening_float_mode === 'previous_close') {
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
      fallback: cfg.opening_float_amount,
    });
  }

  return NextResponse.json({ mode: 'manual', amount: 0 });
}
