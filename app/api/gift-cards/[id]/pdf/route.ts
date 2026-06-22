import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { renderGiftCardPdf } from '@/lib/services/gift-card-pdf';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    code: string; initial_amount: string;
    buyer_name: string | null; buyer_phone: string | null;
    buyer_email: string | null;
    issued_at: string; expires_at: string | null;
    org_name: string; org_legal: string; org_siret: string | null;
    org_address: { line1?: string; zip?: string; city?: string } | null;
    org_phone: string | null;
  }>(
    `SELECT gc.code, gc.initial_amount::text, gc.buyer_name, gc.buyer_phone,
            gc.buyer_email, gc.issued_at, gc.expires_at,
            o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
            o.address AS org_address,
            (o.contact->>'phone') AS org_phone
       FROM gift_cards gc
       JOIN organizations o ON o.id = gc.organization_id
      WHERE gc.id = $1 AND gc.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);
  const r = rows[0]!;

  const buf = await renderGiftCardPdf(
    {
      code: r.code,
      amount: Number(r.initial_amount),
      buyer_name: r.buyer_name,
      buyer_phone: r.buyer_phone,
      buyer_email: r.buyer_email,
      issued_at: r.issued_at,
      expires_at: r.expires_at,
    },
    {
      name: r.org_name,
      legal_name: r.org_legal,
      siret: r.org_siret,
      address: r.org_address,
      phone: r.org_phone,
    },
  );

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="carte-cadeau-${r.code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
