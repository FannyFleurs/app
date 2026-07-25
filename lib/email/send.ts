import 'server-only';
import { query } from '@/lib/db/client';
import { EMAIL_KEY, emailKey, mergeEmailDefaults, type EmailSettings } from '@/lib/settings/email';

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

/**
 * Charge la config email effective pour une boutique.
 *
 * Priorité : configuration propre à la boutique (`email:<storeId>`), sinon
 * repli sur la configuration au niveau organisation (`email`), sinon valeurs
 * par défaut. Ce repli garantit qu'une boutique jamais configurée hérite du
 * modèle existant (même mécanique que le paramétrage ticket).
 */
export async function loadEmailSettings(
  organizationId: string,
  storeId?: string | null,
): Promise<EmailSettings> {
  try {
    const storeKey = emailKey(storeId);
    const { rows } = await query<{ value: Partial<EmailSettings> }>(
      `SELECT value FROM settings
        WHERE organization_id = $1 AND key = ANY($2::text[])
        ORDER BY (key = $3) DESC
        LIMIT 1`,
      [organizationId, [storeKey, EMAIL_KEY], storeKey],
    );
    return mergeEmailDefaults(rows[0]?.value ?? null);
  } catch {
    return mergeEmailDefaults(null);
  }
}

/** Version texte brute d'un HTML (pour l'alternative multipart anti-spam). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/**
 * Envoie un email transactionnel via Brevo pour le compte d'une organisation.
 * No-op « échec propre » si l'envoi n'est pas configuré (enabled + clé + expéditeur).
 */
export async function sendOrgEmail(args: {
  organizationId: string;
  /** Boutique concernée : sélectionne la config email de cette boutique. */
  storeId?: string | null;
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
  const cfg = await loadEmailSettings(args.organizationId, args.storeId);
  if (!cfg.api_key || !cfg.sender_email) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }
  if (!cfg.enabled && !args.allowDisabled) {
    return { ok: false, error: 'DISABLED' };
  }

  const body: Record<string, unknown> = {
    sender: { email: cfg.sender_email, name: cfg.sender_name || cfg.sender_email },
    to: [{ email: args.to, name: args.toName || args.to }],
    // Un reply-to explicite (adresse humaine) renforce la légitimité du message
    // aux yeux des filtres anti-spam.
    replyTo: { email: cfg.sender_email, name: cfg.sender_name || cfg.sender_email },
    subject: args.subject,
    htmlContent: args.html,
    // Alternative texte : un email HTML-seul est bien plus souvent classé en
    // spam. On fournit une version texte dérivée du HTML (multipart).
    textContent: htmlToText(args.html),
    // Aide au classement transactionnel côté Brevo (et statistiques).
    tags: ['transactionnel'],
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
