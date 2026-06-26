import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from '@/lib/settings/stripe';

/**
 * Crée une session Stripe Checkout pour une commande différée et renvoie
 * l'URL au client (la page caisse l'envoie ensuite par email).
 *
 * Conditions :
 *   - La commande existe et appartient à l'organisation.
 *   - Stripe est activé (settings).
 *   - Le payment_status est encore 'pending'.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  // Charge la config Stripe
  const cfgRes = await query<{ value: Partial<StripeSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, STRIPE_KEY],
  );
  const cfg = mergeStripeDefaults(cfgRes.rows[0]?.value ?? null);
  if (!cfg.enabled || !cfg.secret_key) {
    return jsonError('STRIPE_NOT_CONFIGURED', 400, {
      message: 'Configurez votre clé Stripe dans Paramètres → Stripe.',
    });
  }

  const orderRes = await query<{
    id: string; total_amount: string; payment_status: string;
    customer_email: string | null; customer_name: string | null;
    recipient_name: string | null;
  }>(
    `SELECT o.id, o.total_amount::text, COALESCE(o.payment_status, 'pending') AS payment_status,
            c.email AS customer_email,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
            o.recipient_name
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1 AND o.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (orderRes.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const order = orderRes.rows[0]!;

  if (order.payment_status === 'paid') {
    return jsonError('ALREADY_PAID', 409);
  }

  const amountCents = Math.round(Number(order.total_amount) * 100);
  if (amountCents <= 0) return jsonError('INVALID_AMOUNT', 400);

  // Crée la session Stripe Checkout via l'API REST (pas de SDK, fetch direct)
  const successUrl = cfg.return_url
    ? `${cfg.return_url}?session_id={CHECKOUT_SESSION_ID}`
    : `https://checkout.stripe.com/c/pay/{CHECKOUT_SESSION_ID}`;
  const params2 = new URLSearchParams();
  params2.append('mode', 'payment');
  params2.append('payment_method_types[]', 'card');
  params2.append('line_items[0][price_data][currency]', 'eur');
  params2.append('line_items[0][price_data][product_data][name]',
    `Commande ${order.recipient_name ?? order.customer_name ?? 'Webpos POS'}`);
  params2.append('line_items[0][price_data][unit_amount]', String(amountCents));
  params2.append('line_items[0][quantity]', '1');
  params2.append('success_url', successUrl);
  params2.append('cancel_url', successUrl);
  if (order.customer_email) params2.append('customer_email', order.customer_email);
  params2.append('metadata[order_id]', order.id);
  params2.append('metadata[organization_id]', g.user.organizationId);

  let session: { id: string; url: string };
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params2.toString(),
    });
    const body = await r.json();
    if (!r.ok) {
      return NextResponse.json({
        error: 'STRIPE_API_ERROR',
        message: body.error?.message ?? 'Erreur Stripe',
      }, { status: 502 });
    }
    session = { id: body.id, url: body.url };
  } catch (err) {
    return NextResponse.json({
      error: 'STRIPE_API_ERROR',
      message: (err as Error).message,
    }, { status: 502 });
  }

  // Persiste l'URL et le session_id sur la commande
  await query(
    `UPDATE orders
        SET payment_method = 'payment_link',
            payment_link_url = $2,
            payment_link_session_id = $3,
            updated_at = now()
      WHERE id = $1`,
    [order.id, session.url, session.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'orders.payment_link.create',
    entityType: 'order', entityId: order.id,
    payload: { session_id: session.id, amount: amountCents, email: order.customer_email },
  });

  return NextResponse.json({
    url: session.url,
    session_id: session.id,
    email_sent_to: order.customer_email ?? null,
  });
}
