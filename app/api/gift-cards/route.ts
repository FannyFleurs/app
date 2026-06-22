import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { GiftCardService } from '@/lib/services/gift-card-service';
import { audit } from '@/lib/audit/log';
import { query } from '@/lib/db/client';

const createSchema = z.object({
  amount: z.number().positive(),
  expires_at: z.string().optional().nullable(),
  buyer_id: z.string().uuid().optional().nullable(),
  buyer_name: z.string().max(160).optional(),
  buyer_phone: z.string().max(40).optional(),
  buyer_email: z.string().max(160).optional(),
  beneficiary_id: z.string().uuid().optional().nullable(),
  message: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  if (q) {
    const rows = await GiftCardService.search(g.user.organizationId, q, 50);
    return NextResponse.json({ gift_cards: rows });
  }
  const { rows } = await query(
    `SELECT id, code, initial_amount::text, balance::text, status,
            issued_at, expires_at,
            buyer_name, buyer_phone, buyer_email, message
       FROM gift_cards
      WHERE organization_id = $1
      ORDER BY issued_at DESC
      LIMIT 200`,
    [g.user.organizationId],
  );
  return NextResponse.json({ gift_cards: rows });
}

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;
  try {
    const out = await GiftCardService.create({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      amount: d.amount,
      expiresAt: d.expires_at,
      buyer: {
        id: d.buyer_id,
        name: d.buyer_name,
        phone: d.buyer_phone,
        email: d.buyer_email,
      },
      beneficiaryId: d.beneficiary_id,
      message: d.message,
    });
    await audit({
      organizationId: g.user.organizationId, userId: g.user.id,
      action: 'gift_cards.create', entityType: 'gift_card', entityId: out.id,
      payload: { amount: d.amount, code: out.code },
    });
    return NextResponse.json(out, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[gift_cards.create]', err);
    const m = (err as Error).message ?? '';
    const hint = m.includes('buyer_name') || m.includes('column')
      ? 'Migration manquante : exécutez `npm run db:migrate` (0006_gift_card_buyer.sql).'
      : m;
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: hint }, { status: 500 });
  }
}
