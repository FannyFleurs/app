import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';

const schema = z.object({ label: z.string().min(1).max(80) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  await SaleService.hold(params.id, g.user.organizationId, parsed.data.label);
  return NextResponse.json({ ok: true });
}
