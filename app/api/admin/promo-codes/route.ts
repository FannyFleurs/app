import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import {
  getPlatformConfig, createPromotionCode, listPromotionCodes, setPromotionCodeActive,
} from '@/lib/billing/stripe';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Lettres, chiffres, - et _ uniquement'),
  kind: z.enum(['percent', 'amount']),
  value: z.number().positive(),
  duration: z.enum(['once', 'repeating', 'forever']),
  duration_in_months: z.number().int().min(1).max(36).optional(),
  max_redemptions: z.number().int().min(1).max(100000).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function GET() {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const config = await getPlatformConfig();
  if (!config.stripe_secret_key) {
    return NextResponse.json({ codes: [], not_configured: true });
  }
  try {
    const codes = await listPromotionCodes(config);
    return NextResponse.json({ codes });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const config = await getPlatformConfig();
  if (!config.stripe_secret_key) {
    return NextResponse.json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 400 });
  }
  if (parsed.data.kind === 'percent' && parsed.data.value > 100) {
    return NextResponse.json({ error: 'La remise en % ne peut dépasser 100.' }, { status: 400 });
  }
  try {
    const promo = await createPromotionCode(config, parsed.data);
    return NextResponse.json({ code: promo }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, patchSchema);
  if ('response' in parsed) return parsed.response;
  const config = await getPlatformConfig();
  try {
    await setPromotionCodeActive(config, parsed.data.id, parsed.data.active);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
