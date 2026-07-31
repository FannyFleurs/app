import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { resolveReceiptPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import { buildDrawerKickStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';

const schema = z.object({
  register_id: z.string().uuid().optional(),
  store_id: z.string().uuid().optional(),
  reason: z.string().max(200).optional(),
});

/**
 * Ouverture manuelle du tiroir-caisse.
 *   1. Trace la demande (audit / Z).
 *   2. Si une imprimante TICKET CloudPRNT est configurée pour la boutique,
 *      met en file une impulsion « drawer kick » : l'imprimante Star ouvre le
 *      tiroir branché dessus à son prochain sondage.
 * Sans imprimante CloudPRNT, l'ouverture reste pilotée par le matériel
 * (impulsion envoyée à l'impression d'un ticket).
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
      store_id: parsed.data.store_id ?? null,
      reason: parsed.data.reason ?? null,
    },
  });

  let kicked = false;
  try {
    const printer = await resolveReceiptPrinter(g.user.organizationId, parsed.data.store_id ?? null);
    if (printer) {
      const payload = await buildDrawerKickStarPrnt();
      await enqueueJob({
        organizationId: g.user.organizationId,
        printerId: printer.id,
        contentType: STARPRNT_CONTENT_TYPE,
        payload,
        title: 'Ouverture tiroir',
        userId: g.user.id,
      });
      kicked = true;
    }
  } catch {
    /* pas d'imprimante / erreur file : on reste sur l'audit seul */
  }

  return NextResponse.json({ ok: true, drawer_kick_queued: kicked });
}
