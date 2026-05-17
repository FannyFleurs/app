import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { CashSessionService } from '@/lib/services/cash-session-service';
import { query } from '@/lib/db/client';

const openSchema = z.object({
  store_id: z.string().uuid(),
  register_id: z.string().uuid(),
  opening_float: z.number().min(0),
});

export async function GET(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  const registerId = url.searchParams.get('register_id');
  if (!registerId) return jsonError('register_id requis', 400);
  const session = await CashSessionService.getOpenForRegister(registerId);
  return NextResponse.json({ session });
}

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, openSchema);
  if ('response' in parsed) return parsed.response;
  // vérifie appartenance store/register à l'org
  const r = await query(
    `SELECT 1 FROM registers
      WHERE id = $1 AND store_id = $2 AND organization_id = $3 AND is_active`,
    [parsed.data.register_id, parsed.data.store_id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);
  try {
    const out = await CashSessionService.open({
      organizationId: g.user.organizationId,
      storeId: parsed.data.store_id,
      registerId: parsed.data.register_id,
      userId: g.user.id,
      openingFloat: parsed.data.opening_float,
    });
    return NextResponse.json(out, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 409);
  }
}
