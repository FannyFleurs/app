import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/guards';
import { acknowledgeTicket } from '@/lib/support/store';
import { jsonError } from '@/lib/validation/api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/tickets/[id]/ack
 *
 * Accusé de lecture du demandeur : la réponse a été vue. Une demande traitée
 * passe alors en clôturée — c'est la fermeture de la boucle, sans nouvelle
 * intervention de l'opérateur.
 *
 * L'accusé n'est accepté que de l'auteur de la demande (filtre en base).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const g = await requireSession();
  if ('response' in g) return g.response;
  try {
    const ok = await acknowledgeTicket(params.id, g.user.id);
    if (!ok) return jsonError('NOT_FOUND', 404);
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError('SERVER_ERROR', 500);
  }
}
