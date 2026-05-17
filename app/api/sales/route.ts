import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { SaleService } from '@/lib/services/sale-service';
import { query } from '@/lib/db/client';

const createSchema = z.object({
  store_id: z.string().uuid(),
  register_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, createSchema);
  if ('response' in parsed) return parsed.response;
  const r = await query(
    `SELECT 1 FROM registers
      WHERE id = $1 AND store_id = $2 AND organization_id = $3 AND is_active`,
    [parsed.data.register_id, parsed.data.store_id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('REGISTER_NOT_FOUND', 404);

  try {
    const sale = await SaleService.createDraft({
      organizationId: g.user.organizationId,
      storeId: parsed.data.store_id,
      registerId: parsed.data.register_id,
      userId: g.user.id,
      customerId: parsed.data.customer_id ?? null,
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (e) {
    return jsonError((e as Error).message, 400);
  }
}
