import 'server-only';
import { query } from '@/lib/db/client';
import { notifyPlatform, escapeHtml } from '@/lib/email/platform';
import {
  ticketEmailSubject,
  KIND_LABELS,
  SEVERITY_SHORT,
  type SupportTicket,
  type TicketContext,
  type TicketKind,
  type TicketSeverity,
  type TicketStatus,
} from './tickets';

/**
 * Persistance des demandes d'assistance.
 *
 * La capture d'écran n'est jamais chargée avec la liste : c'est une data URL
 * de plusieurs centaines de kilo-octets, elle ne se lit qu'au détail (colonne
 * `screenshot`, exposée par une route dédiée). Les listes ne renvoient qu'un
 * booléen `has_screenshot`.
 */

const FIELDS = [
  'id', 'organization_id', 'created_by', 'author_name', 'author_email',
  'kind', 'severity', 'subject', 'body',
  'page_path', 'app_area', 'poste_ref', 'user_agent',
  'status', 'admin_note', 'resolution',
  'resolved_at', 'acknowledged_at', 'created_at', 'updated_at',
] as const;

/** Colonnes de liste, éventuellement préfixées par l'alias de la table. */
function columns(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `${FIELDS.map((f) => p + f).join(', ')}, (${p}screenshot IS NOT NULL) AS has_screenshot`;
}

const LIST_COLUMNS = columns();

export interface NewTicket {
  organizationId: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  kind: TicketKind;
  severity: TicketSeverity;
  subject: string;
  body: string;
  screenshot: string | null;
  context: TicketContext;
}

/**
 * Enregistre la demande, puis notifie l'opérateur par email. La notification
 * est « best-effort » : la demande existe en base même si l'email échoue,
 * elle apparaît dans la console admin dans tous les cas.
 */
export async function createTicket(
  input: NewTicket,
): Promise<{ ticket: SupportTicket; emailed: boolean }> {
  const { rows } = await query<SupportTicket>(
    `INSERT INTO support_tickets
       (organization_id, created_by, author_name, author_email,
        kind, severity, subject, body,
        page_path, app_area, poste_ref, user_agent, screenshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${LIST_COLUMNS}`,
    [
      input.organizationId,
      input.userId,
      input.authorName,
      input.authorEmail,
      input.kind,
      input.severity,
      input.subject,
      input.body,
      input.context.pagePath,
      input.context.appArea,
      input.context.posteRef,
      input.context.userAgent,
      input.screenshot,
    ],
  );
  const ticket = rows[0]!;

  let orgName = '';
  try {
    const org = await query<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [input.organizationId],
    );
    orgName = org.rows[0]?.name ?? '';
  } catch {
    // Nom d'organisation absent : l'email reste lisible sans lui.
  }

  const emailed = await notifyPlatform({
    subject: ticketEmailSubject({
      kind: ticket.kind,
      severity: ticket.severity,
      subject: ticket.subject,
      orgName: orgName || 'Client',
    }),
    html: buildTicketHtml(ticket, orgName),
    replyToEmail: input.authorEmail || undefined,
    replyToName: input.authorName || undefined,
  });

  return { ticket, emailed };
}

function buildTicketHtml(t: SupportTicket, orgName: string): string {
  const row = (label: string, value: string) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#5A625E;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0;color:#14211D"><strong>${escapeHtml(value)}</strong></td></tr>`
      : '';
  const body = t.body
    ? `<p style="margin:16px 0 0;color:#14211D;white-space:pre-wrap">${escapeHtml(t.body)}</p>`
    : '';
  const shot = t.has_screenshot
    ? '<p style="margin:16px 0 0;color:#5A625E;font-size:13px">Une capture d’écran est jointe à la demande — elle s’ouvre depuis la console d’administration.</p>'
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5">
    <h2 style="margin:0 0 4px;color:#013E37">${escapeHtml(KIND_LABELS[t.kind])} — ${escapeHtml(t.subject)}</h2>
    <p style="margin:0 0 16px;color:#5A625E">Demande d’assistance envoyée depuis l’application.</p>
    <table style="border-collapse:collapse">
      ${row('Boutique', orgName)}
      ${row('Auteur', t.author_name)}
      ${row('Email', t.author_email)}
      ${row('Niveau', t.kind === 'incident' ? SEVERITY_SHORT[t.severity] : '')}
      ${row('Écran', t.page_path)}
      ${row('Application', t.app_area)}
      ${row('Poste', t.poste_ref)}
    </table>
    ${body}
    ${shot}
    <p style="margin:20px 0 0;color:#5A625E;font-size:13px">Traitement dans la console : Demandes d’assistance.</p>
  </div>`;
}

/** Demandes d'une organisation (vue commerçant). */
export async function listOrgTickets(organizationId: string, limit = 50): Promise<SupportTicket[]> {
  const { rows } = await query<SupportTicket>(
    `SELECT ${LIST_COLUMNS}
       FROM support_tickets
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [organizationId, limit],
  );
  return rows;
}

/**
 * Réponses que l'auteur n'a pas encore lues. C'est ce que sonde la fenêtre
 * qui s'ouvre sur l'écran d'où la demande est partie.
 */
export async function listUnreadForUser(userId: string): Promise<SupportTicket[]> {
  const { rows } = await query<SupportTicket>(
    `SELECT ${LIST_COLUMNS}
       FROM support_tickets
      WHERE created_by = $1
        AND acknowledged_at IS NULL
        AND status IN ('traite', 'clos')
      ORDER BY resolved_at ASC NULLS LAST, created_at ASC
      LIMIT 5`,
    [userId],
  );
  return rows;
}

/**
 * Accusé de lecture par l'auteur. Une demande traitée passe alors en clôturée :
 * la boucle est fermée des deux côtés, sans intervention de l'opérateur.
 */
export async function acknowledgeTicket(id: string, userId: string): Promise<boolean> {
  const res = await query(
    `UPDATE support_tickets
        SET acknowledged_at = now(),
            status = CASE WHEN status = 'traite' THEN 'clos' ELSE status END,
            updated_at = now()
      WHERE id = $1 AND created_by = $2 AND acknowledged_at IS NULL`,
    [id, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface AdminTicketFilter {
  status?: TicketStatus | 'ouvertes';
  limit?: number;
}

/** File de traitement de l'opérateur, toutes organisations confondues. */
export async function listAllTickets(
  filter: AdminTicketFilter = {},
): Promise<(SupportTicket & { org_name: string | null })[]> {
  const limit = filter.limit ?? 200;
  // Le filtre passe par un paramètre, jamais par concaténation : `$2` vaut
  // soit un état, soit NULL (aucun filtre).
  const openOnly = filter.status === 'ouvertes';
  const exact = openOnly ? null : (filter.status ?? null);
  const { rows } = await query<SupportTicket & { org_name: string | null }>(
    `SELECT ${columns('t')}, o.name AS org_name
       FROM support_tickets t
       LEFT JOIN organizations o ON o.id = t.organization_id
      WHERE ($2::boolean IS NOT TRUE OR t.status IN ('nouveau','en_cours'))
        AND ($3::text IS NULL OR t.status = $3)
      ORDER BY (t.status IN ('nouveau','en_cours')) DESC, t.created_at DESC
      LIMIT $1`,
    [limit, openOnly, exact],
  );
  return rows;
}

export async function getScreenshot(id: string): Promise<string | null> {
  const { rows } = await query<{ screenshot: string | null }>(
    `SELECT screenshot FROM support_tickets WHERE id = $1`,
    [id],
  );
  return rows[0]?.screenshot ?? null;
}

export interface TicketUpdate {
  status: TicketStatus;
  resolution?: string;
  adminNote?: string;
}

/** Traitement par l'opérateur : état, commentaire de résolution, note interne. */
export async function updateTicket(id: string, patch: TicketUpdate): Promise<SupportTicket | null> {
  const { rows } = await query<SupportTicket>(
    `UPDATE support_tickets
        SET status = $2,
            resolution = COALESCE($3, resolution),
            admin_note = COALESCE($4, admin_note),
            resolved_at = CASE
              WHEN $2 IN ('traite','clos') AND resolved_at IS NULL THEN now()
              WHEN $2 IN ('nouveau','en_cours') THEN NULL
              ELSE resolved_at END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${LIST_COLUMNS}`,
    [id, patch.status, patch.resolution ?? null, patch.adminNote ?? null],
  );
  return rows[0] ?? null;
}

export async function getTicket(id: string): Promise<SupportTicket | null> {
  const { rows } = await query<SupportTicket>(
    `SELECT ${LIST_COLUMNS} FROM support_tickets WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}
