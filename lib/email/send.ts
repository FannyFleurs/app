import 'server-only';
import { query } from '@/lib/db/client';
import { EMAIL_KEY, mergeEmailDefaults, type EmailSettings } from '@/lib/settings/email';

export interface EmailAttachment {
  /** Nom du fichier (ex "facture-F-2026-000002.pdf"). */
  name: string;
  /** Contenu binaire. */
  content: Buffer;
}

export interface SendResult {
  ok: boolean;
  /** Code d'erreur exploitable côté API : NOT_CONFIGURED | PROVIDER_ERROR. */
  error?: string;
  detail?: string;
}

/** Charge la config email d'une organisation. */
export async function loadEmailSettings(organizationId: string): Promise<EmailSettings> {
  try {
    const { rows } = await query<{ value: Partial<EmailSettings> }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [organizationId, EMAIL_KEY],
    );
    return mergeEmailDefaults(rows[0]?.value ?? null);
  } catch {
    return mergeEmailDefaults(null);
  }
}

/**
 * Envoie un email transactionnel via Brevo pour le compte d'une organisation.
 * No-op « échec propre » si l'envoi n'est pas configuré (enabled + clé + expéditeur).
 */
export async function sendOrgEmail(args: {
  organizationId: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  /**
   * Autorise l'envoi même si la bascule « Activer » est désactivée.
   * Utile pour le bouton « Envoyer un test » : on veut pouvoir tester la
   * clé et l'expéditeur avant d'activer l'envoi en production.
   */
  allowDisabled?: boolean;
}): Promise<SendResult> {
  const cfg = await loadEmailSettings(args.organizationId);
  if (!cfg.api_key || !cfg.sender_email) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }
  if (!cfg.enabled && !args.allowDisabled) {
    return { ok: false, error: 'DISABLED' };
  }

  const body: Record<string, unknown> = {
    sender: { email: cfg.sender_email, name: cfg.sender_name || cfg.sender_email },
    to: [{ email: args.to, name: args.toName || args.to }],
    subject: args.subject,
    htmlContent: args.html,
  };
  if (args.attachments && args.attachments.length > 0) {
    body.attachment = args.attachments.map((a) => ({
      name: a.name,
      content: a.content.toString('base64'),
    }));
  }

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': cfg.api_key,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: 'PROVIDER_ERROR', detail: `${r.status} ${txt}`.slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'PROVIDER_ERROR', detail: (e as Error).message };
  }
}
