import 'server-only';
import { query } from '@/lib/db/client';
import { loadPlatform } from './platform';
import { notifyPlatform, escapeHtml } from '@/lib/email/platform';

/**
 * Traitement d'une demande de contact / démo envoyée depuis le site vitrine.
 *
 * Deux garanties :
 *  1. La demande est TOUJOURS enregistrée en base (`contact_messages`), donc
 *     jamais perdue même si l'email n'est pas configuré. Le super-admin la
 *     retrouve dans la console admin.
 *  2. Une notification est envoyée à l'adresse de contact de la plateforme,
 *     via la configuration Brevo de l'organisation opératrice, avec un
 *     reply-to pointant sur le visiteur (réponse directe).
 */

export interface ContactInput {
  name: string;
  shop: string;
  email: string;
  phone: string;
  message: string;
}

function buildHtml(input: ContactInput, brand: string): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#5A625E;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#14211D"><strong>${escapeHtml(value)}</strong></td></tr>`
      : '';
  const message = input.message
    ? `<p style="margin:16px 0 0;color:#14211D;white-space:pre-wrap">${escapeHtml(input.message)}</p>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5">
    <h2 style="margin:0 0 4px;color:#013E37">Nouvelle demande de démo</h2>
    <p style="margin:0 0 16px;color:#5A625E">Reçue depuis le site ${escapeHtml(brand)}.</p>
    <table style="border-collapse:collapse">
      ${row('Nom', input.name)}
      ${row('Boutique', input.shop)}
      ${row('Email', input.email)}
      ${row('Téléphone', input.phone)}
    </table>
    ${message}
    <p style="margin:20px 0 0;color:#5A625E;font-size:13px">Répondez directement à cet email pour recontacter ${escapeHtml(input.name || 'le prospect')}.</p>
  </div>`;
}

export async function saveAndNotifyContact(input: ContactInput): Promise<{ ok: boolean; emailed: boolean }> {
  // 1. Persistance (jamais perdue).
  await query(
    `INSERT INTO contact_messages (name, shop, email, phone, message)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.name, input.shop, input.email, input.phone, input.message],
  );

  // 2. Notification email (best-effort).
  let emailed = false;
  try {
    const platform = await loadPlatform();
    const brand = platform.brand_name || 'HelloPos';
    emailed = await notifyPlatform({
      subject: `Demande de démo — ${input.shop || input.name}`,
      html: buildHtml(input, brand),
      replyToEmail: input.email,
      replyToName: input.name,
    });
  } catch {
    // La demande est déjà enregistrée : on n'échoue pas côté visiteur.
  }

  return { ok: true, emailed };
}
