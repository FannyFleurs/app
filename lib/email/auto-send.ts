import 'server-only';
import { query } from '@/lib/db/client';
import { loadEmailSettings, sendOrgEmail } from '@/lib/email/send';
import { buildInvoicePdf, buildReceiptPdf } from '@/lib/services/pdf-builders';

/**
 * Envoi automatique des documents par email (Brevo), piloté par les
 * bascules de /settings/email (auto_send_invoice / auto_send_receipt).
 *
 * Toutes ces fonctions sont « fire-and-forget » : elles n'échouent jamais de
 * façon propagée (l'opération métier — facture générée, vente validée — est
 * déjà committée). En cas de souci on log simplement.
 */

/** Envoie la facture par email si l'auto-envoi est activé et qu'une adresse existe. */
export async function autoSendInvoiceIfEnabled(
  invoiceId: string,
  organizationId: string,
): Promise<void> {
  try {
    const cfg = await loadEmailSettings(organizationId);
    if (!cfg.enabled || !cfg.auto_send_invoice) return;

    const pdf = await buildInvoicePdf(invoiceId, organizationId);
    if (!pdf) return;
    const to = pdf.customer_email?.trim();
    if (!to) return; // pas d'adresse → rien à envoyer

    const res = await sendOrgEmail({
      organizationId,
      to,
      toName: pdf.customer_name ?? undefined,
      subject: `Votre facture ${pdf.number}`.trim(),
      html:
        `<p>Bonjour,</p>`
        + `<p>Veuillez trouver ci-joint votre facture <strong>${pdf.number}</strong>.</p>`
        + `<p>Merci pour votre confiance.</p>`,
      attachments: [{ name: `facture-${pdf.number}.pdf`, content: pdf.buffer }],
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[email.auto.invoice]', invoiceId, res.error, res.detail ?? '');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email.auto.invoice]', invoiceId, err);
  }
}

/** Envoie le ticket par email si l'auto-envoi est activé et que le client a une adresse. */
export async function autoSendReceiptIfEnabled(
  receiptId: string,
  organizationId: string,
): Promise<void> {
  try {
    const cfg = await loadEmailSettings(organizationId);
    if (!cfg.enabled || !cfg.auto_send_receipt) return;

    // Adresse email du client attaché à la vente (sinon rien à envoyer).
    const r = await query<{ email: string | null; name: string | null }>(
      `SELECT c.email,
              COALESCE(c.company_name, NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS name
         FROM receipts rc
         JOIN sales s ON s.id = rc.sale_id
         JOIN customers c ON c.id = s.customer_id
        WHERE rc.id = $1 AND rc.organization_id = $2`,
      [receiptId, organizationId],
    );
    const to = r.rows[0]?.email?.trim();
    if (!to) return;

    const pdf = await buildReceiptPdf(receiptId, organizationId);
    if (!pdf) return;

    const res = await sendOrgEmail({
      organizationId,
      to,
      toName: r.rows[0]?.name ?? undefined,
      subject: `Votre ticket ${pdf.number}`,
      html:
        `<p>Bonjour,</p>`
        + `<p>Veuillez trouver ci-joint votre ticket de caisse <strong>${pdf.number}</strong>.</p>`
        + `<p>Merci pour votre visite.</p>`,
      attachments: [{ name: `ticket-${pdf.number}.pdf`, content: pdf.buffer }],
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error('[email.auto.receipt]', receiptId, res.error, res.detail ?? '');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email.auto.receipt]', receiptId, err);
  }
}
