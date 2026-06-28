import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

const schema = z.object({
  pickup_or_delivery: z.enum(['pickup', 'delivery']),
  requested_at: z.string().min(1),
  slot_label: z.string().max(80),
  recipient_name: z.string().max(120).optional().nullable(),
  recipient_phone: z.string().max(40).optional().nullable(),
  delivery_address: z.object({
    line1: z.string().max(160),
    zip: z.string().max(20),
    city: z.string().max(80),
  }).nullable().optional(),
  internal_notes: z.string().max(500).optional().nullable(),
});

/**
 * Attache les infos retrait/livraison à une vente DRAFT.
 * À appeler depuis OrderModal juste avant d'ouvrir la modale de paiement.
 *
 * Migration 0019 : si la colonne delivery_info n'existe pas, on no-op
 * (l'info ne sera juste pas persistée mais le flow continue).
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  try {
    const res = await query(
      `UPDATE sales
          SET delivery_info = $1::jsonb,
              updated_at = now()
        WHERE id = $2 AND organization_id = $3
          AND status IN ('draft', 'on_hold')`,
      [JSON.stringify(parsed.data), params.id, g.user.organizationId],
    );
    if (res.rowCount === 0) {
      return jsonError('NOT_FOUND_OR_SEALED', 404);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('delivery_info')) {
      // Migration 0019 pas appliquée — on ignore silencieusement
      return NextResponse.json({ ok: true, skipped: 'MIGRATION_MISSING' });
    }
    return jsonError('INTERNAL_ERROR', 500, { message: msg });
  }
}
