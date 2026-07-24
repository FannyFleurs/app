import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { sendOrgEmail } from '@/lib/email/send';
import { buildReceiptPdf } from '@/lib/services/pdf-builders';

// email optionnel : si absent, on tente l'email du client rattaché à la vente.
const schema = z.object({
  email: z.string().email().optional(),
});

/**
 * Renvoi du ticket par email depuis « Ma journée » (on part de l'id de vente,
 * pas de l'id de ticket). Si aucun email n'est fourni, on utilise celui du
 * client rattaché ; à défaut on renvoie EMAIL_REQUIRED pour que la caisse
 * demande une adresse.
 */
export async function POST(req: Request, { params }: { params: { saleId: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const r = await query<{
    id: string; number: string; store_id: string | null; customer_email: string | null;
  }>(
    `SELECT rc.id, rc.number, s.store_id, c.email AS customer_email
       FROM receipts rc
       JOIN sales s ON s.id = rc.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
      WHERE rc.sale_id = $1 AND rc.organization_id = $2`,
    [params.saleId, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const receipt = r.rows[0]!;

  const email = (parsed.data.email ?? receipt.customer_email ?? '').trim().toLowerCase();
  if (!email) return jsonError('EMAIL_REQUIRED', 422);

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'receipt.email_requested',
    entityType: 'receipt',
    entityId: receipt.id,
    payload: { receipt_number: receipt.number, email, resent: true },
  });

  let delivered = false;
  let sendError: string | undefined;
  const pdf = await buildReceiptPdf(receipt.id, g.user.organizationId);
  if (pdf) {
    const res = await sendOrgEmail({
      organizationId: g.user.organizationId,
      storeId: receipt.store_id,
      to: email,
      subject: `Votre ticket ${receipt.number}`,
      html: `<p>Bonjour,</p><p>Veuillez trouver ci-joint votre ticket de caisse `
        + `<strong>${receipt.number}</strong>.</p><p>Merci pour votre visite.</p>`,
      attachments: [{ name: `ticket-${receipt.number}.pdf`, content: pdf.buffer }],
    });
    delivered = res.ok;
    if (!res.ok) sendError = res.error;
  }

  return NextResponse.json({ ok: true, email, delivered, send_error: sendError ?? null });
}
