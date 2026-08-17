import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { getTicket, updateTicket, getScreenshot } from '@/lib/support/store';
import { TICKET_STATUSES, canTransition, requiresResolution } from '@/lib/support/tickets';

export const dynamic = 'force-dynamic';

const schema = z.object({
  status: z.enum(TICKET_STATUSES),
  resolution: z.string().trim().max(2000).optional(),
  admin_note: z.string().trim().max(2000).optional(),
});

/** GET /api/admin/support-tickets/[id]?screenshot=1 — capture d'écran seule. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const url = new URL(req.url);
  if (url.searchParams.get('screenshot') === '1') {
    const shot = await getScreenshot(params.id);
    if (!shot) return jsonError('NOT_FOUND', 404);
    return NextResponse.json({ screenshot: shot });
  }
  const ticket = await getTicket(params.id);
  if (!ticket) return jsonError('NOT_FOUND', 404);
  return NextResponse.json({ ticket });
}

/**
 * PATCH /api/admin/support-tickets/[id] — traitement d'une demande.
 *
 * Passer une demande en « traité » exige un commentaire : c'est lui que le
 * commerçant lira, un état seul ne lui apprend rien.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const current = await getTicket(params.id);
  if (!current) return jsonError('NOT_FOUND', 404);

  if (!canTransition(current.status, d.status)) {
    return jsonError('TRANSITION_REFUSEE', 409, {
      message: 'Une demande clôturée a déjà été lue par son auteur : elle ne se rouvre pas.',
    });
  }

  const resolution = d.resolution ?? current.resolution;
  if (requiresResolution(d.status) && !resolution.trim()) {
    return jsonError('RESOLUTION_REQUISE', 422, {
      message: 'Indiquez ce qui a été fait : ce commentaire est affiché au commerçant.',
    });
  }

  const ticket = await updateTicket(params.id, {
    status: d.status,
    resolution: d.resolution,
    adminNote: d.admin_note,
  });
  if (!ticket) return jsonError('NOT_FOUND', 404);

  await audit({
    organizationId: ticket.organization_id,
    userId: g.user.id,
    action: 'support.ticket.update',
    entityType: 'support_ticket',
    entityId: ticket.id,
    payload: { from: current.status, to: ticket.status },
  }).catch(() => { /* la trace ne conditionne pas le traitement */ });

  return NextResponse.json({ ok: true, ticket });
}
