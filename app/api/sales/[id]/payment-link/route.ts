import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { STRIPE_KEY, mergeStripeDefaults, type StripeSettings } from '@/lib/settings/stripe';

export const dynamic = 'force-dynamic';

/**
 * Crée une session Stripe Checkout pour une VENTE caisse (déjà validée
 * fiscalement) et renvoie l'URL à envoyer au client par email.
 *
 * Conditions :
 *   - La vente existe et appartient à l'organisation.
 *   - Stripe est activé.
 *   - sales.payment_status est NULL ou 'pending'.
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

  const saleRes = await query<{
    id: string; total_ttc: string; payment_status: string | null;
    customer_email: string | null; customer_name: string | null;
    receipt_number: string | null;
  }>(
    `SELECT s.id, s.total_ttc::text,
            s.payment_status,
            c.email AS customer_email,
            COALESCE(c.company_name,
              NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer_name,
            r.number AS receipt_number
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN receipts r ON r.sale_id = s.id
      WHERE s.id = $1 AND s.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (saleRes.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const sale = saleRes.rows[0]!;

  if (sale.payment_status === 'paid') return jsonError('ALREADY_PAID', 409);

  const amountCents = Math.round(Number(sale.total_ttc) * 100);
  if (amountCents <= 0) return jsonError('INVALID_AMOUNT', 400);

  // Crée la session Stripe Checkout via l'API REST
  const successUrl = cfg.return_url
    ? `${cfg.return_url}?session_id={CHECKOUT_SESSION_ID}`
    : `https://checkout.stripe.com/c/pay/{CHECKOUT_SESSION_ID}`;
  const params2 = new URLSearchParams();
  params2.append('mode', 'payment');
  params2.append('payment_method_types[]', 'card');
  params2.append('line_items[0][price_data][currency]', 'eur');
  params2.append('line_items[0][price_data][product_data][name]',
    `Vente ${sale.receipt_number ?? ''} ${sale.customer_name ?? 'Webpos'}`.trim());
  params2.append('line_items[0][price_data][unit_amount]', String(amountCents));
  params2.append('line_items[0][quantity]', '1');
  params2.append('success_url', successUrl);
  params2.append('cancel_url', successUrl);
  if (sale.customer_email) params2.append('customer_email', sale.customer_email);
  // metadata.sale_id : exploité par le webhook pour updater la vente
  params2.append('metadata[sale_id]', sale.id);
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

  // Persiste l'URL + session_id sur la vente
  try {
    await query(
      `UPDATE sales
          SET payment_status = COALESCE(payment_status, 'pending'),
              payment_link_url = $2,
              payment_link_session_id = $3,
              updated_at = now()
        WHERE id = $1`,
      [sale.id, session.url, session.id],
    );
  } catch {
    // Migration 0020 pas appliquée : on continue, l'URL est juste retournée
  }

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'sales.payment_link.create',
    entityType: 'sale', entityId: sale.id,
    payload: { session_id: session.id, amount: amountCents, email: sale.customer_email },
  });

  return NextResponse.json({
    url: session.url,
    session_id: session.id,
    email_sent_to: sale.customer_email ?? null,
  });
}
