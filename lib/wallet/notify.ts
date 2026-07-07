/**
 * Notifie tous les devices Apple Wallet enregistres pour un client
 * qu'un changement a eu lieu. Bumpe updated_at pour que l'iPhone
 * detecte la mise a jour au prochain pull, ET envoie un push APNs
 * pour declencher le pull immediatement.
 *
 * Fire-and-forget : on n'echoue jamais une vente pour une erreur
 * de wallet. Tout est log en console.
 */

import { query } from '@/lib/db/client';
import { sendUpdatePush, isConfigured } from './apple-pass';

export async function pushWalletUpdateForCustomer(
  customerId: string,
  organizationId: string,
): Promise<void> {
  try {
    const passes = await query<{ id: string; pass_type_id: string }>(
      `SELECT id, pass_type_id FROM wallet_passes
        WHERE customer_id = $1 AND organization_id = $2 AND provider = 'apple'`,
      [customerId, organizationId],
    );
    if (passes.rowCount === 0) return;

    for (const pass of passes.rows) {
      // 1. Bump updated_at : le prochain pull renverra le pass a jour
      //    (et le if-passesUpdatedSince renverra ce serial).
      await query(
        `UPDATE wallet_passes SET updated_at = now() WHERE id = $1`,
        [pass.id],
      );

      // 2. Envoie un push APNs vide a tous les devices enregistres.
      if (!isConfigured()) continue;
      const devs = await query<{ push_token: string }>(
        `SELECT push_token FROM wallet_devices WHERE pass_id = $1`,
        [pass.id],
      );
      if (devs.rowCount === 0) continue;
      const tokens = devs.rows.map((r) => r.push_token);
      const res = await sendUpdatePush(pass.pass_type_id, tokens);
      if (res.failed > 0) {
        // eslint-disable-next-line no-console
        console.warn('[wallet.push]', pass.pass_type_id, res);
      }
      await query(
        `UPDATE wallet_passes SET last_pushed_at = now() WHERE id = $1`,
        [pass.id],
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[wallet.push]', err);
  }
}
