import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { createTicket, listOrgTickets } from '@/lib/support/store';
import { TICKET_KINDS, TICKET_SEVERITIES } from '@/lib/support/tickets';

// Envoi d'email (Brevo) + accès Postgres : runtime Node, jamais Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  kind: z.enum(TICKET_KINDS),
  severity: z.enum(TICKET_SEVERITIES).optional().default('gene'),
  subject: z.string().trim().min(1, 'requis').max(160),
  body: z.string().trim().max(4000).optional().default(''),
  // Capture d'écran : data URL JPEG compressée côté client. Même plafond que
  // la photo produit prise au PDA (~1,5 Mo), au-delà la ligne devient absurde.
  screenshot: z.string().max(1_500_000).optional().nullable(),
  page_path: z.string().max(300).optional().default(''),
  app_area: z.string().max(20).optional().default('caisse'),
  poste_ref: z.string().max(40).optional().default(''),
});

/** GET /api/support/tickets — les demandes de la boutique. */
export async function GET() {
  const g = await requirePermission('support.request');
  if ('response' in g) return g.response;
  try {
    const tickets = await listOrgTickets(g.user.organizationId);
    return NextResponse.json({ tickets });
  } catch {
    // Migration 0070 non appliquée : la page s'affiche vide plutôt qu'en erreur.
    return NextResponse.json({ tickets: [] });
  }
}

/**
 * POST /api/support/tickets — nouvelle demande d'assistance.
 *
 * Enregistrée d'abord, notifiée ensuite : une configuration email absente ne
 * doit pas faire perdre la demande du commerçant.
 */
export async function POST(req: Request) {
  const g = await requirePermission('support.request');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const d = parsed.data;

  const shot = d.screenshot && d.screenshot.startsWith('data:image/') ? d.screenshot : null;

  try {
    const { ticket, emailed } = await createTicket({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      authorName: g.user.fullName,
      authorEmail: g.user.email,
      kind: d.kind,
      severity: d.kind === 'incident' ? d.severity : 'mineur',
      subject: d.subject,
      body: d.body,
      screenshot: shot,
      context: {
        pagePath: d.page_path,
        appArea: d.app_area === 'bo' ? 'bo' : 'caisse',
        posteRef: d.poste_ref,
        userAgent: (req.headers.get('user-agent') ?? '').slice(0, 400),
      },
    });

    await audit({
      organizationId: g.user.organizationId,
      userId: g.user.id,
      action: 'support.ticket.create',
      entityType: 'support_ticket',
      entityId: ticket.id,
      payload: { kind: ticket.kind, severity: ticket.severity, emailed },
    }).catch(() => { /* la trace ne conditionne pas la demande */ });

    return NextResponse.json({ ok: true, ticket, emailed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('support_tickets')) {
      return jsonError('MIGRATION_MANQUANTE', 503);
    }
    return jsonError('SERVER_ERROR', 500);
  }
}
