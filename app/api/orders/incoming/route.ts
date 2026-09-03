import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { parseJson, jsonError } from '@/lib/validation/api';
import { resolveOrgByOrderToken } from '@/lib/settings/order-integration-server';
import { createIncomingOrder } from '@/lib/services/order-intake';

export const dynamic = 'force-dynamic';

const schema = z.object({
  external_ref: z.string().min(1).max(200),
  boutique: z.string().min(1).max(120),
  lines: z.array(z.object({
    label: z.string().min(1).max(300),
    amount_ttc: z.number(),
    quantity: z.number().positive().max(9999).optional(),
    tax_rate: z.number().min(0).max(100).optional(),
    reference: z.string().max(120).nullable().optional(),
    message_carte: z.string().max(2000).nullable().optional(),
  })).min(1).max(50),
  total_ttc: z.number().optional(),
  client: z.object({
    name: z.string().max(160).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().max(200).nullable().optional(),
  }).nullable().optional(),
  delivery: z.object({
    type: z.string().max(40).nullable().optional(),
    date: z.string().max(40).nullable().optional(),
    slot: z.string().max(80).nullable().optional(),
    recipient: z.string().max(160).nullable().optional(),
    address: z.string().max(200).nullable().optional(),
    cp_ville: z.string().max(120).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  }).nullable().optional(),
  comment: z.string().max(2000).nullable().optional(),
});

/** Jeton présenté par l'app commande : en-tête Bearer ou X-Order-Token. */
function readToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const x = req.headers.get('x-order-token');
  return x ? x.trim() : null;
}

/**
 * Réception d'une commande poussée par l'app commande externe.
 * Authentifiée par jeton d'organisation (pas de session utilisateur).
 * Crée une VENTE EN ATTENTE dans la boutique correspondante ; le caissier
 * l'encaisse ensuite normalement.
 */
export async function POST(req: Request) {
  const token = readToken(req);
  if (!token) return jsonError('MISSING_TOKEN', 401);

  const resolved = await resolveOrgByOrderToken(token);
  if (!resolved) return jsonError('INVALID_TOKEN', 401);
  const { organizationId, settings } = resolved;

  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  // Boutique -> store, via le mapping configuré dans l'admin.
  const storeId = settings.boutique_map[d.boutique];
  if (!storeId) {
    return jsonError('UNKNOWN_BOUTIQUE', 422, {
      message: `Boutique « ${d.boutique} » non mappée. Boutiques connues : ${Object.keys(settings.boutique_map).join(', ') || '(aucune)'}.`,
    });
  }
  const own = await query(
    `SELECT 1 FROM stores WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
    [storeId, organizationId],
  );
  if (own.rowCount === 0) return jsonError('STORE_NOT_FOUND', 422);

  try {
    const out = await createIncomingOrder({
      organizationId,
      storeId,
      externalRef: d.external_ref,
      boutiqueLabel: d.boutique,
      lines: d.lines,
      client: d.client ?? null,
      delivery: d.delivery ?? null,
      comment: d.comment ?? null,
    });
    return NextResponse.json(
      { ok: true, sale_id: out.id, status: out.status, duplicate: out.duplicate },
      { status: out.duplicate ? 200 : 201 },
    );
  } catch (e) {
    const msg = (e as Error).message || 'INTERNAL_ERROR';
    const status = msg === 'NO_ACTIVE_REGISTER' || msg === 'NO_USER' ? 422 : 500;
    return jsonError(msg, status);
  }
}
