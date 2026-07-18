import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import { sendOrgEmail } from '@/lib/email/send';
import { buildInvoicePdf } from '@/lib/services/pdf-builders';

const schema = z.object({
  email: z.string().email().optional(), // si omis, on prend l'email du client
});

/**
 * Demande d'envoi de la facture par email.
 *
 * Si `email` est fourni, il prime ; sinon on utilise l'email du client attaché.
 * Comportement Phase 2 : on enregistre la demande dans l'audit + on met
 * à jour le statut de la facture à 'sent'. La pile SMTP réelle est branchée
 * en Phase 4 (worker email + relances).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;

  const inv = await query<{
    id: string; number: string | null; customer_id: string | null; status: string;
    customer_email: string | null;
  }>(
    `SELECT i.id, i.number, i.customer_id, i.status,
            c.email AS customer_email
       FROM invoices i
       LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1 AND i.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (inv.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const invoice = inv.rows[0]!;

  const targetEmail = parsed.data.email?.trim().toLowerCase()
    ?? invoice.customer_email?.toLowerCase()
    ?? null;
  if (!targetEmail) return jsonError('NO_EMAIL', 400);

  // Si l'email est nouveau et que le client n'en a pas → on le sauvegarde
  if (invoice.customer_id && !invoice.customer_email) {
    await query(
      `UPDATE customers SET email = $1, updated_at = now() WHERE id = $2`,
      [targetEmail, invoice.customer_id],
    );
  }

  // Statut → 'sent' si actuellement validated ou draft
  if (invoice.status === 'validated' || invoice.status === 'draft') {
    await query(
      `UPDATE invoices SET status = 'sent', updated_at = now() WHERE id = $1`,
      [invoice.id],
    );
  }

  // Envoi réel via Brevo (si configuré), avec la facture en pièce jointe.
  let delivered = false;
  let sendError: string | undefined;
  const pdf = await buildInvoicePdf(invoice.id, g.user.organizationId);
  if (pdf) {
    const res = await sendOrgEmail({
      organizationId: g.user.organizationId,
      to: targetEmail,
      subject: `Votre facture ${invoice.number ?? ''}`.trim(),
      html: `<p>Bonjour,</p><p>Veuillez trouver ci-joint votre facture`
        + `${invoice.number ? ` <strong>${invoice.number}</strong>` : ''}.</p>`
        + `<p>Merci pour votre confiance.</p>`,
      attachments: [{ name: `facture-${invoice.number ?? invoice.id}.pdf`, content: pdf.buffer }],
    });
    delivered = res.ok;
    if (!res.ok) sendError = res.error;
  }

  await audit({
    organizationId: g.user.organizationId,
    userId: g.user.id,
    action: 'invoice.email_requested',
    entityType: 'invoice',
    entityId: invoice.id,
    payload: { number: invoice.number, email: targetEmail, delivered, error: sendError ?? null },
  });

  // Si l'email n'est pas configuré, on renvoie tout de même OK (l'adresse est
  // enregistrée et le statut passé à « envoyée ») mais on signale not_configured
  // pour que l'UI puisse inviter à configurer Brevo.
  return NextResponse.json({ ok: true, email: targetEmail, delivered, send_error: sendError ?? null });
}
