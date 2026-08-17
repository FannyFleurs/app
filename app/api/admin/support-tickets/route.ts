import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { listAllTickets } from '@/lib/support/store';
import { isTicketStatus } from '@/lib/support/tickets';

export const dynamic = 'force-dynamic';

/** GET /api/admin/support-tickets?status=ouvertes|nouveau|en_cours|traite|clos */
export async function GET(req: Request) {
  const g = await requireSuperAdmin();
  if ('response' in g) return g.response;
  const raw = new URL(req.url).searchParams.get('status');
  const status = raw === 'ouvertes' || isTicketStatus(raw) ? raw : undefined;
  try {
    const tickets = await listAllTickets({ status });
    return NextResponse.json({ tickets });
  } catch {
    // Migration 0070 non appliquée : liste vide plutôt qu'une erreur 500.
    return NextResponse.json({ tickets: [] });
  }
}
