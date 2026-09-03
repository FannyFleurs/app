import 'server-only';
import { createHmac } from 'node:crypto';
import { query } from '@/lib/db/client';
import { loadOrderIntegration } from '@/lib/settings/order-integration-server';

/**
 * Signale à l'app commande externe qu'une commande a été ENCAISSÉE.
 *
 * Ne fait quelque chose que si la vente provient d'une commande entrante
 * (delivery_info.source = 'commande') et que l'organisation a configuré une
 * URL de callback. Le corps est signé en HMAC-SHA256 avec le secret partagé
 * (en-tête X-HelloPos-Signature) pour que l'app externe vérifie l'origine.
 *
 * Best-effort : ne lève jamais (la vente est déjà scellée). Idempotent via
 * delivery_info.callback_status.
 */
export async function notifyOrderPaidIfNeeded(args: {
  organizationId: string;
  saleId: string;
  receiptNumber: string;
  totalTtc: number;
}): Promise<void> {
  try {
    const res = await query<{ delivery_info: Record<string, unknown> | null }>(
      // to_jsonb : ne lève pas si la colonne delivery_info (migration 0019)
      // n'existe pas sur une organisation ancienne — la fonction devient un no-op.
      `SELECT to_jsonb(sales) -> 'delivery_info' AS delivery_info
         FROM sales WHERE id = $1 AND organization_id = $2`,
      [args.saleId, args.organizationId],
    );
    const info = res.rows[0]?.delivery_info;
    if (!info || info.source !== 'commande') return;
    if (info.callback_status === 'sent') return;
    const externalRef = typeof info.external_ref === 'string' ? info.external_ref : null;
    if (!externalRef) return;

    const settings = await loadOrderIntegration(args.organizationId);
    if (!settings.enabled || !settings.callback_url) return;

    const body = JSON.stringify({
      external_ref: externalRef,
      status: 'paid',
      receipt_number: args.receiptNumber,
      total_ttc: args.totalTtc,
      paid_at: new Date().toISOString(),
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (settings.callback_secret) {
      headers['X-HelloPos-Signature'] = createHmac('sha256', settings.callback_secret)
        .update(body, 'utf8').digest('hex');
    }

    const r = await fetch(settings.callback_url, { method: 'POST', headers, body });
    if (r.ok) {
      await query(
        `UPDATE sales
            SET delivery_info = jsonb_set(delivery_info, '{callback_status}', '"sent"')
          WHERE id = $1 AND organization_id = $2`,
        [args.saleId, args.organizationId],
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[orders.notify_paid]', err);
  }
}
