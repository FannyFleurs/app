import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { storeInOrg } from '@/lib/auth/stores-server';
import {
  loadEffectivePaymentMethodDrawerMap,
  savePaymentMethodDrawerOverride,
} from '@/lib/settings/payment-method-drawer-server';

const schema = z.object({
  store_id: z.string().uuid(),
  code: z.string().min(1).max(40),
  opens_drawer: z.boolean(),
});

/**
 * Ouverture du tiroir-caisse par mode de règlement, PAR BOUTIQUE — voir
 * lib/settings/payment-method-drawer.ts. `store_id` est obligatoire en
 * écriture : il n'existe plus de réglage organisation modifiable ici, pour
 * qu'une modification depuis une boutique ne touche plus jamais les autres.
 */
export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const storeId = new URL(req.url).searchParams.get('store_id') || undefined;
  if (storeId && !(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }
  const settings = await loadEffectivePaymentMethodDrawerMap(g.user.organizationId, storeId);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id: storeId, code, opens_drawer: opensDrawer } = parsed.data;
  if (!(await storeInOrg(storeId, g.user.organizationId))) {
    return NextResponse.json({ error: 'STORE_NOT_FOUND' }, { status: 404 });
  }

  const merged = await savePaymentMethodDrawerOverride({
    organizationId: g.user.organizationId, storeId, code, opensDrawer, updatedBy: g.user.id,
  });

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'settings.payment_method_drawer.update',
    entityType: 'settings', entityId: storeId,
    payload: { store_id: storeId, code, opens_drawer: opensDrawer },
  });

  return NextResponse.json({ settings: merged });
}
