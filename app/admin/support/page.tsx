import { listAllTickets } from '@/lib/support/store';
import type { SupportTicket } from '@/lib/support/tickets';
import SupportTicketsClient from './SupportTicketsClient';

export const dynamic = 'force-dynamic';

/**
 * Demandes d'assistance envoyées depuis les caisses et les back-offices.
 *
 * Le premier rendu est servi par le serveur (la file « à traiter »), la suite
 * se recharge côté client au changement de filtre.
 */
export default async function AdminSupportPage() {
  let rows: (SupportTicket & { org_name: string | null })[] = [];
  try {
    rows = await listAllTickets({ status: 'ouvertes' });
  } catch {
    // Migration 0070 non appliquée : liste vide.
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Demandes d’assistance</h1>
      <p className="text-sm text-ink-soft mb-5">
        Problèmes et souhaits d’amélioration signalés depuis l’application. Une
        notification email part à chaque nouvelle demande. Le commentaire de
        résolution est affiché au commerçant sur l’écran d’où il a écrit.
      </p>
      <SupportTicketsClient initial={rows} />
    </div>
  );
}
