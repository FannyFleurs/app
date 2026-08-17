import { describe, it, expect } from 'vitest';
import {
  STATUS_LABELS,
  STATUS_HINTS,
  TICKET_STATUSES,
  canTransition,
  isAwaitingRead,
  isOpen,
  isTicketStatus,
  requiresResolution,
  ticketEmailSubject,
} from '../lib/support/tickets';
import { ROLES, hasPermission } from '../lib/auth/rbac';

describe('Demandes d’assistance', () => {
  it('tous les rôles peuvent demander de l’aide', () => {
    // La personne qui constate la panne tient le comptoir : c'est souvent
    // celle qui a le moins de droits.
    for (const role of ROLES) {
      expect(hasPermission(role, 'support.request')).toBe(true);
    }
  });

  it('l’entrée de menu Assistance porte une permission et n’est pas masquable', async () => {
    const { SIDEBAR_ITEMS } = await import('@/components/Sidebar');
    const item = SIDEBAR_ITEMS.find((i) => i.href === '/support');
    expect(item).toBeDefined();
    expect(item!.perm).toBe('support.request');
    expect(item!.required).toBe(true);
    // Ni boOnly ni appOnly : visible en caisse ET au back-office.
    expect(item!.boOnly).toBeUndefined();
    expect(item!.appOnly).toBeUndefined();
  });

  it('une demande clôturée ne se rouvre pas', () => {
    expect(canTransition('clos', 'en_cours')).toBe(false);
    expect(canTransition('clos', 'nouveau')).toBe(false);
    expect(canTransition('clos', 'clos')).toBe(true);
  });

  it('une demande traitée peut revenir en cours — la réponse n’était pas la bonne', () => {
    expect(canTransition('traite', 'en_cours')).toBe(true);
    expect(canTransition('nouveau', 'traite')).toBe(true);
  });

  it('passer en « traité » exige un commentaire, pas les autres états', () => {
    expect(requiresResolution('traite')).toBe(true);
    expect(requiresResolution('en_cours')).toBe(false);
    expect(requiresResolution('clos')).toBe(false);
  });

  it('la réponse reste à lire tant que l’auteur ne l’a pas accusée', () => {
    expect(isAwaitingRead('traite', null)).toBe(true);
    expect(isAwaitingRead('clos', null)).toBe(true);
    expect(isAwaitingRead('traite', '2026-08-17T10:00:00Z')).toBe(false);
    // Une demande encore ouverte n'a rien à annoncer.
    expect(isAwaitingRead('nouveau', null)).toBe(false);
    expect(isAwaitingRead('en_cours', null)).toBe(false);
  });

  it('les états ouverts sont ceux qui restent à traiter', () => {
    expect(isOpen('nouveau')).toBe(true);
    expect(isOpen('en_cours')).toBe(true);
    expect(isOpen('traite')).toBe(false);
    expect(isOpen('clos')).toBe(false);
  });

  it('chaque état a un libellé et une explication', () => {
    for (const s of TICKET_STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_HINTS[s]).toBeTruthy();
    }
  });

  it('isTicketStatus refuse ce qui n’est pas un état', () => {
    expect(isTicketStatus('traite')).toBe(true);
    expect(isTicketStatus('ouvertes')).toBe(false);
    expect(isTicketStatus(null)).toBe(false);
  });

  it('un incident bloquant se repère à l’objet de l’email', () => {
    expect(
      ticketEmailSubject({ kind: 'incident', severity: 'bloquant', subject: 'Caisse figée', orgName: 'Fanny Fleurs' }),
    ).toBe('[BLOQUANT] Fanny Fleurs — Caisse figée');
    expect(
      ticketEmailSubject({ kind: 'incident', severity: 'gene', subject: 'Ticket illisible', orgName: 'Fanny Fleurs' }),
    ).toBe('[Problème] Fanny Fleurs — Ticket illisible');
    // Le niveau ne s'applique pas à un souhait d'amélioration.
    expect(
      ticketEmailSubject({ kind: 'amelioration', severity: 'bloquant', subject: 'Dupliquer une commande', orgName: 'Fanny Fleurs' }),
    ).toBe('[Amélioration] Fanny Fleurs — Dupliquer une commande');
  });
});
