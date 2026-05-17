import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { CashSessionService } from '@/lib/services/cash-session-service';

const schema = z.object({ counted_cash: z.number().min(0) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  try {
    const out = await CashSessionService.close({
      organizationId: g.user.organizationId,
      sessionId: params.id,
      userId: g.user.id,
      countedCash: parsed.data.counted_cash,
    });
    return NextResponse.json(out);
  } catch (e) {
    return jsonError((e as Error).message, 409);
  }
}
