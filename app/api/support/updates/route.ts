import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { listUnreadForUser } from '@/lib/support/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/support/updates
 *
 * Réponses non lues de l'utilisateur connecté. Sondé par la fenêtre qui
 * s'ouvre sur l'écran où la demande a été faite : l'opérateur clôt dans sa
 * console, le commerçant le voit là où il travaille.
 *
 * Aucune permission requise au-delà de la session : on ne renvoie que les
 * demandes dont l'utilisateur est lui-même l'auteur.
 */
export async function GET() {
  const g = await requireSession();
  if ('response' in g) return g.response;
  try {
    const tickets = await listUnreadForUser(g.user.id);
    return NextResponse.json({
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        kind: t.kind,
        status: t.status,
        resolution: t.resolution,
        page_path: t.page_path,
        resolved_at: t.resolved_at,
      })),
    });
  } catch {
    // Migration 0070 non appliquée : rien à annoncer.
    return NextResponse.json({ tickets: [] });
  }
}
