import { query } from '@/lib/db/client';
import { isDepositReason, DEPOSIT_LABEL } from '@/lib/services/cash-deposit';

/**
 * Journal d'une journée : tout ce qui touche aux espèces et aux gestes
 * sensibles, remis dans l'ordre où c'est arrivé.
 *
 * Les faits existent déjà, éparpillés : l'ouverture et la fermeture de caisse
 * dans `cash_sessions`, les remises en banque dans `cash_movements`, les
 * ouvertures manuelles du tiroir et les annulations dans `audit_logs`, le
 * scellement dans `daily_closures`. Séparés, ils ne racontent rien ; réunis sur
 * une ligne de temps, ils répondent à la seule question qui compte le
 * lendemain matin : qui a fait quoi, à quelle heure, pour combien.
 *
 * Rien n'est calculé ici : on lit, on nomme, on ordonne.
 */

export type HistoryGroup = 'especes' | 'ventes' | 'clotures' | 'acces' | 'parametres';

export interface HistoryEvent {
  /** Horodatage ISO — clé de tri unique du journal. */
  at: string;
  group: HistoryGroup;
  /** Intitulé court, déjà en français. */
  label: string;
  /** Qui. Null quand l'action n'est rattachée à personne (traitement auto). */
  person: string | null;
  /** Montant en euros quand il y en a un. */
  amount: number | null;
  /** Précision libre : motif, écart de caisse, numéro de ticket… */
  detail: string | null;
  /** `true` pour ce qui mérite un œil : écart, annulation, échec de connexion. */
  attention: boolean;
}

export interface DayHistory {
  date: string;
  store_name: string | null;
  events: HistoryEvent[];
  summary: {
    /** Ouvertures manuelles du tiroir, et par qui. */
    drawer_opens: number;
    drawer_by_person: { person: string; count: number }[];
    bank_deposits_total: number;
    bank_deposits_count: number;
    /** Écart de caisse cumulé des fermetures du jour (compté − attendu). */
    cash_variance: number | null;
    sensitive_count: number;
  };
}

/** Actions du journal d'audit retenues, avec leur groupe et leur intitulé. */
const AUDIT_ACTIONS: Record<string, { group: HistoryGroup; label: string; attention?: boolean }> = {
  'cash_drawer.opened':               { group: 'especes',    label: 'Ouverture manuelle du tiroir', attention: true },
  'customers.settle_account_payment': { group: 'especes',    label: 'Règlement d\'un compte client' },
  'sales.cancel_validated':           { group: 'ventes',     label: 'Vente validée annulée', attention: true },
  'sales.return':                     { group: 'ventes',     label: 'Retour / avoir', attention: true },
  'sales.correct_payment':            { group: 'ventes',     label: 'Mode de règlement corrigé', attention: true },
  'sales.attach_customer_after':      { group: 'ventes',     label: 'Client rattaché après la vente' },
  'inventory.finalize':               { group: 'ventes',     label: 'Inventaire validé' },
  'auth.login.failed':                { group: 'acces',      label: 'Connexion refusée', attention: true },
  'auth.pin_login.failed':            { group: 'acces',      label: 'Code PIN refusé', attention: true },
  'admin.session.revoke':             { group: 'acces',      label: 'Session révoquée', attention: true },
  'permissions.role.update':          { group: 'acces',      label: 'Droits d\'un rôle modifiés', attention: true },
  'permissions.user.update':          { group: 'acces',      label: 'Droits d\'un utilisateur modifiés', attention: true },
  'users.create':                     { group: 'acces',      label: 'Utilisateur créé' },
  'users.update':                     { group: 'acces',      label: 'Utilisateur modifié' },
  'settings.cash.update':             { group: 'parametres', label: 'Réglages de caisse modifiés' },
  'settings.opening_float.update':    { group: 'parametres', label: 'Fond de caisse par défaut modifié' },
  'settings.receipt.update':          { group: 'parametres', label: 'Réglages du ticket modifiés' },
  'tax_rates.create':                 { group: 'parametres', label: 'Taux de TVA créé', attention: true },
  'tax_rates.update':                 { group: 'parametres', label: 'Taux de TVA modifié', attention: true },
  'tax_rates.deactivate':             { group: 'parametres', label: 'Taux de TVA désactivé', attention: true },
  'stores.update':                    { group: 'parametres', label: 'Boutique modifiée' },
};

const euros = (v: unknown): number | null => (v == null ? null : Number(v));

export async function computeDayHistory(opts: {
  organizationId: string;
  storeId: string;
  date: string; // YYYY-MM-DD
}): Promise<DayHistory> {
  const { organizationId: org, storeId: store, date } = opts;
  const P = [org, store, date] as const;

  const [storeR, sessionsR, movementsR, closuresR, auditR] = await Promise.all([
    query<{ name: string }>(`SELECT name FROM stores WHERE id = $1`, [store]),

    // Ouvertures et fermetures. Une session ouverte la veille et fermée
    // aujourd'hui doit apparaître ici par sa fermeture : les deux dates sont
    // donc testées séparément.
    query<{
      id: string; opened_at: string; closed_at: string | null;
      opened_today: boolean; closed_today: boolean;
      opening_float: string; counted_cash: string | null;
      expected_cash: string | null; cash_variance: string | null;
      opened_by_name: string | null; closed_by_name: string | null;
    }>(
      // Le « ce jour-là » est tranché en SQL : une session ouverte hier et
      // fermée aujourd'hui ne doit apparaître que par sa fermeture.
      `SELECT cs.id, cs.opened_at, cs.closed_at,
              (cs.opened_at::date = $3::date) AS opened_today,
              (cs.closed_at::date = $3::date) AS closed_today,
              cs.opening_float::text, cs.counted_cash::text,
              cs.expected_cash::text, cs.cash_variance::text,
              uo.full_name AS opened_by_name, uc.full_name AS closed_by_name
         FROM cash_sessions cs
         LEFT JOIN users uo ON uo.id = cs.opened_by
         LEFT JOIN users uc ON uc.id = cs.closed_by
        WHERE cs.organization_id = $1 AND cs.store_id = $2
          AND (cs.opened_at::date = $3::date OR cs.closed_at::date = $3::date)
        ORDER BY cs.opened_at`,
      [...P],
    ),

    query<{
      created_at: string; movement_type: string; amount: string;
      reason: string; person: string | null;
    }>(
      `SELECT cm.created_at, cm.movement_type, cm.amount::text, cm.reason,
              u.full_name AS person
         FROM cash_movements cm
         JOIN cash_sessions cs ON cs.id = cm.cash_session_id
         LEFT JOIN users u ON u.id = cm.user_id
        WHERE cs.organization_id = $1 AND cs.store_id = $2
          AND cm.created_at::date = $3::date
        ORDER BY cm.created_at`,
      [...P],
    ),

    query<{
      sealed_at: string; seq: number; cash_counted: string | null;
      cash_variance: string | null; total_ttc: string; person: string | null;
    }>(
      `SELECT dc.sealed_at, dc.seq, dc.cash_counted::text, dc.cash_variance::text,
              dc.total_ttc::text, u.full_name AS person
         FROM daily_closures dc
         LEFT JOIN users u ON u.id = dc.closed_by
        WHERE dc.organization_id = $1 AND dc.store_id = $2 AND dc.business_date = $3::date
        ORDER BY dc.seq`,
      [...P],
    ),

    // Journal d'audit, scopé à CETTE boutique. On ne garde QUE les lignes dont
    // la charge utile désigne cette boutique : les événements sans boutique
    // (portée organisation) ne doivent pas apparaître sur chaque boutique — une
    // « connexion refusée » d'un poste de Plante Verte n'a rien à faire dans
    // l'historique de Mortagne. Les événements de connexion portent désormais
    // le store_id du poste (cf. auth/pin-login).
    query<{
      created_at: string; action: string; person: string | null;
      payload: Record<string, unknown>; severity: string;
    }>(
      `SELECT a.created_at, a.action, u.full_name AS person, a.payload, a.severity
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.organization_id = $1
          AND a.created_at::date = $3::date
          AND a.action = ANY($4::text[])
          AND a.payload->>'store_id' = $2
        ORDER BY a.created_at`,
      [org, store, date, Object.keys(AUDIT_ACTIONS)],
    ),
  ]);

  const events: HistoryEvent[] = [];

  for (const s of sessionsR.rows) {
    if (s.opened_today) {
      events.push({
        at: new Date(s.opened_at).toISOString(),
        group: 'especes',
        label: 'Ouverture de caisse',
        person: s.opened_by_name,
        amount: euros(s.opening_float),
        detail: 'Fond de caisse à l\'ouverture',
        attention: false,
      });
    }
    if (s.closed_at && s.closed_today) {
      const ecart = euros(s.cash_variance);
      events.push({
        at: new Date(s.closed_at).toISOString(),
        group: 'especes',
        label: 'Fermeture de caisse',
        person: s.closed_by_name,
        amount: euros(s.counted_cash),
        detail: ecart == null
          ? 'Espèces comptées'
          : `Espèces comptées · attendu ${fmt(euros(s.expected_cash))} · écart ${signe(ecart)}`,
        attention: ecart != null && Math.abs(ecart) >= 0.01,
      });
    }
  }

  for (const m of movementsR.rows) {
    const sortie = m.movement_type === 'out';
    const banque = isDepositReason(m.reason);
    events.push({
      at: new Date(m.created_at).toISOString(),
      group: 'especes',
      label: banque ? DEPOSIT_LABEL : sortie ? 'Sortie d\'espèces' : 'Entrée d\'espèces',
      person: m.person,
      amount: sortie ? -Number(m.amount) : Number(m.amount),
      detail: m.reason,
      attention: sortie && !banque,
    });
  }

  for (const c of closuresR.rows) {
    const ecart = euros(c.cash_variance);
    events.push({
      at: new Date(c.sealed_at).toISOString(),
      group: 'clotures',
      label: c.seq > 1 ? `Clôture de journée (n°${c.seq})` : 'Clôture de journée',
      person: c.person,
      amount: euros(c.total_ttc),
      detail: ecart == null
        ? 'Journée scellée'
        : `Journée scellée · espèces comptées ${fmt(euros(c.cash_counted))} · écart ${signe(ecart)}`,
      attention: ecart != null && Math.abs(ecart) >= 0.01,
    });
  }

  for (const a of auditR.rows) {
    const def = AUDIT_ACTIONS[a.action];
    if (!def) continue;
    events.push({
      at: new Date(a.created_at).toISOString(),
      group: def.group,
      label: def.label,
      person: a.person,
      amount: montantDePayload(a.payload),
      detail: detailDePayload(a.action, a.payload),
      attention: def.attention === true || a.severity === 'security' || a.severity === 'error',
    });
  }

  events.sort((x, y) => x.at.localeCompare(y.at));

  // Récapitulatif : les trois chiffres qu'on vient vérifier, plus le compte
  // des ouvertures de tiroir par personne — c'est la question posée.
  const tiroirs = events.filter((e) => e.label === 'Ouverture manuelle du tiroir');
  const parPersonne = new Map<string, number>();
  for (const t of tiroirs) {
    const qui = t.person ?? 'Inconnu';
    parPersonne.set(qui, (parPersonne.get(qui) ?? 0) + 1);
  }
  const remises = events.filter((e) => e.label === DEPOSIT_LABEL);
  const fermetures = sessionsR.rows.filter((s) => s.closed_today && s.cash_variance != null);

  return {
    date,
    store_name: storeR.rows[0]?.name ?? null,
    events,
    summary: {
      drawer_opens: tiroirs.length,
      drawer_by_person: [...parPersonne.entries()]
        .map(([person, count]) => ({ person, count }))
        .sort((a, b) => b.count - a.count),
      bank_deposits_total: remises.reduce((s, e) => s + Math.abs(e.amount ?? 0), 0),
      bank_deposits_count: remises.length,
      cash_variance: fermetures.length > 0
        ? Number(fermetures.reduce((s, f) => s + Number(f.cash_variance), 0).toFixed(2))
        : null,
      sensitive_count: events.filter((e) => e.attention).length,
    },
  };
}

/* ------------------------------------------------------------------ */

function fmt(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(2).replace('.', ',')} €`;
}

function signe(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} €`;
}

/** Montant lisible dans la charge utile d'un audit, quand il y en a un. */
function montantDePayload(p: Record<string, unknown>): number | null {
  for (const cle of ['amount', 'total_ttc', 'montant']) {
    const v = p[cle];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Précision utile selon l'action, lue dans la charge utile réellement écrite
 * par chaque appel : numéro d'avoir, motif, email tenté. Sans cela, deux
 * lignes « Retour / avoir » à la même heure seraient impossibles à distinguer.
 */
function detailDePayload(action: string, p: Record<string, unknown>): string | null {
  const texte = (cle: string) => (typeof p[cle] === 'string' && p[cle] !== '' ? (p[cle] as string) : null);
  const morceaux = (...v: (string | null)[]) => v.filter(Boolean).join(' · ') || null;
  switch (action) {
    case 'cash_drawer.opened':
      return texte('reason') ?? 'Sans vente associée';
    case 'sales.cancel_validated':
      return morceaux(texte('credit_note_number') && `Avoir ${texte('credit_note_number')}`);
    case 'sales.return':
      return morceaux(
        texte('credit_note_number') && `Avoir ${texte('credit_note_number')}`,
        texte('refund_method') && `remboursé en ${methode(texte('refund_method')!)}`,
      );
    case 'sales.correct_payment':
      return morceaux(
        texte('from_method') && texte('to_method')
          ? `${methode(texte('from_method')!)} → ${methode(texte('to_method')!)}`
          : null,
        texte('reason'),
      );
    case 'auth.login.failed':
      return morceaux(texte('email'), texte('reason'));
    case 'auth.pin_login.failed':
      return morceaux(texte('reason'), typeof p.attempts === 'number' ? `${p.attempts} tentative(s)` : null);
    case 'permissions.role.update':
      return morceaux(texte('role'), texte('permission'));
    default:
      return texte('reason') ?? texte('name') ?? null;
  }
}

/** Nom courant d'un mode de règlement (le journal se lit en français). */
function methode(code: string): string {
  const table: Record<string, string> = {
    cash: 'espèces', card: 'carte bancaire', check: 'chèque', transfer: 'virement',
    gift_card: 'carte cadeau', credit_note: 'avoir', deferred: 'différé client',
    payment_link: 'lien de paiement', other: 'autre',
  };
  return table[code] ?? code;
}
