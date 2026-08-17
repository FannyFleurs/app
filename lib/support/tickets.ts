/**
 * Demandes d'assistance : vocabulaire partagé par la caisse, le back-office
 * et la console admin.
 *
 * Aucun accès base ici — ce fichier est importé par des composants client
 * (libellés, tons, transitions). La persistance vit dans lib/support/store.ts.
 */

export const TICKET_KINDS = ['incident', 'amelioration'] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_SEVERITIES = ['bloquant', 'gene', 'mineur'] as const;
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];

/**
 * `nouveau` → `en_cours` → `traite` → `clos`.
 *
 * `traite` est posé par l'opérateur avec un commentaire ; `clos` l'est par le
 * demandeur quand il a lu la réponse. Une demande peut aussi être close
 * directement par l'opérateur (doublon, sans suite) : l'état final est le
 * même, la réponse reste affichée au demandeur.
 */
export const TICKET_STATUSES = ['nouveau', 'en_cours', 'traite', 'clos'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const KIND_LABELS: Record<TicketKind, string> = {
  incident: 'Problème',
  amelioration: 'Amélioration',
};

export const SEVERITY_LABELS: Record<TicketSeverity, string> = {
  bloquant: 'Bloquant — je ne peux pas vendre',
  gene: 'Gênant — je peux continuer autrement',
  mineur: 'Mineur — détail, affichage',
};

export const SEVERITY_SHORT: Record<TicketSeverity, string> = {
  bloquant: 'Bloquant',
  gene: 'Gênant',
  mineur: 'Mineur',
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  traite: 'Traité',
  clos: 'Clôturé',
};

/** Ce que le demandeur lit, à la place du terme de gestion interne. */
export const STATUS_HINTS: Record<TicketStatus, string> = {
  nouveau: 'Reçue, en attente de prise en charge.',
  en_cours: 'Prise en charge, traitement en cours.',
  traite: 'Résolue.',
  clos: 'Clôturée.',
};

/** Une demande dont la réponse est encore à lire par son auteur. */
export function isAwaitingRead(status: TicketStatus, acknowledgedAt: string | null): boolean {
  return acknowledgedAt === null && (status === 'traite' || status === 'clos');
}

/** États dans lesquels la demande est encore ouverte côté opérateur. */
export function isOpen(status: TicketStatus): boolean {
  return status === 'nouveau' || status === 'en_cours';
}

/**
 * Passage d'un état à l'autre. Le seul mouvement interdit est le retour en
 * arrière depuis `clos` : une demande close a été lue par son auteur, la
 * rouvrir afficherait une réponse déjà accusée. Une demande traitée peut en
 * revanche revenir en cours — la réponse n'était pas la bonne.
 */
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  if (from === 'clos') return false;
  return true;
}

/** Un passage en « traité » sans commentaire ne dit rien au demandeur. */
export function requiresResolution(to: TicketStatus): boolean {
  return to === 'traite';
}

export interface TicketContext {
  /** Chemin de la page d'où part la demande (ex. `/caisse`). */
  pagePath: string;
  /** `caisse` ou `bo` : les deux applications partagent le même menu. */
  appArea: string;
  /** Référence du poste (HP-XXXXXX) si la demande vient d'une caisse liée. */
  posteRef: string;
  userAgent: string;
}

export interface SupportTicket {
  id: string;
  organization_id: string;
  created_by: string | null;
  author_name: string;
  author_email: string;
  kind: TicketKind;
  severity: TicketSeverity;
  subject: string;
  body: string;
  page_path: string;
  app_area: string;
  poste_ref: string;
  user_agent: string;
  status: TicketStatus;
  admin_note: string;
  resolution: string;
  has_screenshot: boolean;
  resolved_at: string | null;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export function isTicketKind(v: unknown): v is TicketKind {
  return typeof v === 'string' && (TICKET_KINDS as readonly string[]).includes(v);
}

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === 'string' && (TICKET_STATUSES as readonly string[]).includes(v);
}

/**
 * Objet de l'email de notification. Le niveau apparaît en tête pour les
 * incidents : une caisse à l'arrêt ne se lit pas au milieu d'une liste.
 */
export function ticketEmailSubject(t: {
  kind: TicketKind;
  severity: TicketSeverity;
  subject: string;
  orgName: string;
}): string {
  const tag = t.kind === 'incident'
    ? (t.severity === 'bloquant' ? 'BLOQUANT' : 'Problème')
    : 'Amélioration';
  return `[${tag}] ${t.orgName} — ${t.subject}`;
}
