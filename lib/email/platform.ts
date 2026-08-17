import 'server-only';
import { query } from '@/lib/db/client';
import { sendOrgEmail, type EmailAttachment } from './send';
import { loadPlatform } from '@/lib/site/platform';

/**
 * Envoi d'un email « de la plateforme » — c'est-à-dire adressé à l'opérateur
 * HelloPos lui-même, et non à un client d'une boutique.
 *
 * La plateforme n'a pas de compte Brevo à elle : on emprunte la configuration
 * d'une organisation opératrice, la première dont la clé API et l'expéditeur
 * sont renseignés. Sans configuration email, rien n'est envoyé — l'appelant
 * doit avoir déjà persisté ce qu'il notifie.
 *
 * Partagé par les demandes de contact du site vitrine et par les demandes
 * d'assistance envoyées depuis la caisse.
 */

export interface SenderOrg {
  organizationId: string;
  senderEmail: string;
}

export async function resolveSenderOrg(): Promise<SenderOrg | null> {
  try {
    const { rows } = await query<{ organization_id: string; sender: string }>(
      `SELECT organization_id, value->>'sender_email' AS sender
         FROM settings
        WHERE key LIKE 'email%'
          AND COALESCE(value->>'api_key', '') <> ''
          AND COALESCE(value->>'sender_email', '') <> ''
        ORDER BY (COALESCE(value->>'enabled', 'false') = 'true') DESC, updated_at DESC
        LIMIT 1`,
    );
    const r = rows[0];
    return r ? { organizationId: r.organization_id, senderEmail: r.sender } : null;
  } catch {
    return null;
  }
}

export interface PlatformEmail {
  subject: string;
  html: string;
  /** Adresse de réponse : celle de la personne qui a écrit. */
  replyToEmail?: string;
  replyToName?: string;
  attachments?: EmailAttachment[];
  /** Destinataire explicite ; par défaut l'adresse de contact de la plateforme. */
  to?: string;
}

/**
 * Notifie l'opérateur. Renvoie `false` (sans lever) si aucune organisation
 * n'a de configuration email : une notification manquée ne doit jamais faire
 * échouer l'action du commerçant.
 */
export async function notifyPlatform(mail: PlatformEmail): Promise<boolean> {
  try {
    const platform = await loadPlatform();
    const sender = await resolveSenderOrg();
    if (!sender) return false;
    const brand = platform.brand_name || 'HelloPos';
    const res = await sendOrgEmail({
      organizationId: sender.organizationId,
      to: mail.to || platform.contact_email || sender.senderEmail,
      toName: brand,
      subject: mail.subject,
      html: mail.html,
      replyToEmail: mail.replyToEmail,
      replyToName: mail.replyToName,
      attachments: mail.attachments,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Échappement HTML pour insérer du texte saisi dans un corps d'email. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
