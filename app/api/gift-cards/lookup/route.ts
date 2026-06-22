import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { GiftCardService } from '@/lib/services/gift-card-service';

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const code = new URL(req.url).searchParams.get('code')?.trim();
  if (!code) return jsonError('code requis', 400);

  const card = await GiftCardService.lookup(g.user.organizationId, code);
  if (!card) return jsonError('NOT_FOUND', 404);

  const remaining = Number(card.balance);
  const expired = card.expires_at && new Date(card.expires_at).getTime() < Date.now();
  return NextResponse.json({
    id: card.id,
    code: card.code,
    remaining,
    status: card.status,
    buyer_name: card.buyer_name,
    buyer_phone: card.buyer_phone,
    expires_at: card.expires_at,
    usable: !expired && card.status === 'active' && remaining > 0,
  });
}
