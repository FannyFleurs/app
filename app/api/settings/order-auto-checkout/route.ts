import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { storeInOrg } from '@/lib/auth/stores-server';
import { scopedSettingKey } from '@/lib/settings/scoped';
import { ORDER_AUTO_CHECKOUT_KEY, mergeOrderAutoCheckoutDefaults } from '@/lib/settings/order-auto-checkout';
import { loadOrderAutoCheckout } from '@/lib/settings/order-auto-checkout-server';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  enabled: z.boolean().optional(),
  web_payment_method_id: z.string().uuid().nullable().optional(),
  ogf_payment_method_id: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  const g = await requirePermission('settings.read');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  const settings = await loadOrderAutoCheckout(g.user.organizationId, storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id: storeId, ...fields } = parsed.data;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }

  // Une caisse virtuelle n'a ni tiroir ni client physiquement présent : seuls
  // les modes réglables sans rien "en main" (espèces exclues — pas de
  // tiroir réel ; carte cadeau/avoir exclus — rien à présenter/scanner) ont
  // un sens comme défaut d'une commande automatique.
  const ALLOWED_KINDS = new Set(['card', 'check', 'transfer', 'deferred', 'other', 'payment_link']);
  const ids = [fields.web_payment_method_id, fields.ogf_payment_method_id].filter(
    (v): v is string => typeof v === 'string',
  );
  if (ids.length > 0) {
    const { rows } = await query<{ id: string; kind: string }>(
      `SELECT id, kind FROM payment_methods WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [g.user.organizationId, ids],
    );
    const byId = new Map(rows.map((r) => [r.id, r.kind]));
    for (const id of ids) {
      if (!byId.has(id)) return jsonError('PAYMENT_METHOD_NOT_FOUND', 404);
      if (!ALLOWED_KINDS.has(byId.get(id)!)) {
        return jsonError('PAYMENT_METHOD_NOT_ALLOWED', 422, {
          message: 'Ce mode de règlement ne peut pas être le défaut d\'une commande automatique (caisse virtuelle, sans tiroir ni client présent).',
        });
      }
    }
  }

  const existing = await loadOrderAutoCheckout(g.user.organizationId, storeId);
  const merged = mergeOrderAutoCheckoutDefaults({ ...existing, ...fields });
  const key = scopedSettingKey(ORDER_AUTO_CHECKOUT_KEY, storeId);

  await query(
    `INSERT INTO settings (organization_id, key, value, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [g.user.organizationId, key, JSON.stringify(merged), g.user.id],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.order_auto_checkout.update',
    entityType: 'settings', entityId: storeId ?? null,
    payload: { store_id: storeId ?? null, ...fields },
  });

  return NextResponse.json({ settings: merged });
}
