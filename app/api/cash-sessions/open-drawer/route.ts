import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';

const schema = z.object({
  register_id: z.string().uuid().optional(),
  reason: z.string().max(200).optional(),
});

/**
 * Marque une ouverture manuelle du tiroir-caisse (audit applicatif).
 * Côté hardware, le tiroir physique est piloté par l'imprimante ticket
 * via un signal de drawer kick. La présente route trace simplement la
 * demande, à des fins d'audit et de revue.
 */
export async function POST(req: Request) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'cash_drawer.opened',
    severity: 'info',
    payload: {
      register_id: parsed.data.register_id ?? null,
      reason: parsed.data.reason ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
