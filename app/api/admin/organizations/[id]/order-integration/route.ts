import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import {
  toPublicOrderIntegration,
  type BoutiqueMap,
} from '@/lib/settings/order-integration';
import {
  loadOrderIntegration,
  saveOrderIntegration,
  generateOrderToken,
  generateCallbackSecret,
  sha256Hex,
} from '@/lib/settings/order-integration-server';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    enabled: z.boolean(),
    callback_url: z.string().url().max(500).nullable(),
    boutique_map: z.record(z.string().uuid()),
  }),
  z.object({ action: z.literal('rotate_token') }),
  z.object({ action: z.literal('set_callback_secret') }),
  z.object({ action: z.literal('clear_callback_secret') }),
]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;

  const settings = await loadOrderIntegration(params.id);
  const stores = await query<{ id: string; name: string }>(
    `SELECT id, name FROM stores WHERE organization_id = $1 AND is_active = TRUE ORDER BY name`,
    [params.id],
  );
  return NextResponse.json({
    integration: toPublicOrderIntegration(settings),
    stores: stores.rows,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const exists = await query(`SELECT 1 FROM organizations WHERE id = $1`, [params.id]);
  if (exists.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const current = await loadOrderIntegration(params.id);

  if (d.action === 'update') {
    // Ne garder que les boutiques mappées vers un store réel de l'organisation.
    const stores = await query<{ id: string }>(
      `SELECT id FROM stores WHERE organization_id = $1 AND is_active = TRUE`,
      [params.id],
    );
    const validIds = new Set(stores.rows.map((s) => s.id));
    const map: BoutiqueMap = {};
    for (const [label, storeId] of Object.entries(d.boutique_map)) {
      if (validIds.has(storeId)) map[label.trim()] = storeId;
    }
    await saveOrderIntegration(params.id, {
      ...current,
      enabled: d.enabled,
      callback_url: d.callback_url || null,
      boutique_map: map,
    }, g.user.id);
    return NextResponse.json({ ok: true, integration: toPublicOrderIntegration({ ...current, enabled: d.enabled, callback_url: d.callback_url || null, boutique_map: map }) });
  }

  if (d.action === 'rotate_token') {
    const token = generateOrderToken();
    await saveOrderIntegration(params.id, {
      ...current,
      token_hash: sha256Hex(token),
      token_hint: token.slice(-6),
    }, g.user.id);
    // Le jeton en clair n'est renvoyé qu'ici, une seule fois.
    return NextResponse.json({ ok: true, token });
  }

  if (d.action === 'set_callback_secret') {
    const secret = generateCallbackSecret();
    await saveOrderIntegration(params.id, { ...current, callback_secret: secret }, g.user.id);
    return NextResponse.json({ ok: true, secret });
  }

  // clear_callback_secret
  await saveOrderIntegration(params.id, { ...current, callback_secret: null }, g.user.id);
  return NextResponse.json({ ok: true });
}
