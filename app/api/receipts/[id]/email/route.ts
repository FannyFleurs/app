import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { sendOrgEmail } from '@/lib/email/send';
import { buildReceiptPdf } from '@/lib/services/pdf-builders';

const schema = z.object({
  email: z.string().email(),
});

/**
 * Demande d'envoi du ticket par email.
 * Au moment où la pile SMTP est branchée (Phase 4), ce point écrit une
 * tâche dans une file. Pour l'instant on enregistre la demande dans
 * l'audit + on met à jour l'email du client si manquant.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const email = parsed.data.email.trim().toLowerCase();

  // Vérifie le ticket + récupère la boutique de la vente (config par boutique)
  const r = await query<{ id: string; sale_id: string; number: string; store_id: string | null }>(
    `SELECT rc.id, rc.sale_id, rc.number, s.store_id
       FROM receipts rc
       JOIN sales s ON s.id = rc.sale_id
      WHERE rc.id = $1 AND rc.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const receipt = r.rows[0]!;

  // Si client présent sans email, on l'enregistre sur sa fiche
  const cust = await query<{ id: string; email: string | null }>(
    `SELECT c.id, c.email
       FROM sales s
       JOIN customers c ON c.id = s.customer_id
      WHERE s.id = $1`,
    [receipt.sale_id],
  );
  if (cust.rowCount > 0 && !cust.rows[0]!.email) {
    await query(
      `UPDATE customers SET email = $1, updated_at = now() WHERE id = $2`,
      [email, cust.rows[0]!.id],
    );
  }

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'receipt.email_requested',
    entityType: 'receipt',
    entityId: receipt.id,
    payload: { receipt_number: receipt.number, email },
  });

  // Envoi réel via Brevo (si configuré), ticket en pièce jointe.
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
