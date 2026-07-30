import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import {
  mergeWithDefaults, POS_UI_KEY, loyaltyGroupKey, type PosUiSettings,
} from '@/lib/settings/pos-ui';

/**
 * Solde fidélité d'un client.
 *
 * Fidélité segmentée (offre Croissance+) : le solde dépend du GROUPE de la
 * boutique. La caisse transmet donc `?store_id=…` (boutique du poste) pour
 * obtenir le solde du bon groupe — c'est celui-là qui peut être utilisé.
 * Sans `store_id` (back-office), on renvoie le TOTAL tous groupes confondus.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const settings = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(settings.rows[0]?.value ?? null);

  const storeId = new URL(req.url).searchParams.get('store_id');

  let accountId: string | null = null;
  let balance = 0;
  try {
    if (storeId) {
      // Solde du groupe correspondant à cette boutique (utilisable ici).
      const groupKey = loyaltyGroupKey(ui.loyalty, storeId);
      const acc = await query<{ id: string; points_balance: number }>(
        `SELECT id, points_balance FROM loyalty_accounts
          WHERE customer_id = $1 AND group_key = $2`,
        [params.id, groupKey],
      );
      accountId = acc.rows[0]?.id ?? null;
      balance = Number(acc.rows[0]?.points_balance ?? 0);
    } else {
      // Total tous groupes (vue back-office).
      const acc = await query<{ total: string }>(
        `SELECT COALESCE(SUM(points_balance),0)::text AS total
           FROM loyalty_accounts WHERE customer_id = $1`,
        [params.id],
      );
      balance = Number(acc.rows[0]?.total ?? 0);
    }
  } catch {
    // Colonne group_key absente (migration 0034 non appliquée) : repli.
    const acc = await query<{ id: string; points_balance: number }>(
      `SELECT id, points_balance FROM loyalty_accounts WHERE customer_id = $1`,
      [params.id],
    );
    accountId = acc.rows[0]?.id ?? null;
    balance = Number(acc.rows[0]?.points_balance ?? 0);
  }

  // Client exclu de la fidélité (opt-out sur sa fiche) : on renvoie enabled=false
  // pour que la caisse masque la fidélité et n'autorise aucune utilisation de
  // points. Défensif si la colonne 0055 n'est pas encore appliquée.
  let customerOptedIn = true;
  try {
    const c = await query<{ loyalty_enabled: boolean }>(
      `SELECT loyalty_enabled FROM customers WHERE id = $1 AND organization_id = $2`,
      [params.id, g.user.organizationId],
    );
    customerOptedIn = c.rows[0]?.loyalty_enabled !== false;
  } catch { /* colonne absente : opté-in */ }

  return NextResponse.json({
    loyalty: customerOptedIn ? ui.loyalty : { ...ui.loyalty, enabled: false },
    account_id: accountId,
    balance_euros: customerOptedIn ? balance : 0, // 1 point = 1 €
  });
}
