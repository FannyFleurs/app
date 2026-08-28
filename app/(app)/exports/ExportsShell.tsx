'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import ExportForm from './ExportForm';
import ExportHistory from './ExportHistory';
import SalesAccountsSection from './SalesAccountsSection';

type Tab = 'export' | 'historique' | 'configuration';

/**
 * Onglets de la page d'exports comptables :
 *  - Export : le formulaire de génération.
 *  - Historique : les exports déjà générés.
 *  - Configuration : les comptes de ventes (règles + croisements sans compte),
 *    réservée à qui peut lire la comptabilité.
 */
export default function ExportsShell(
  { canRead, canEdit, canAssignFamily }:
  { canRead: boolean; canEdit: boolean; canAssignFamily: boolean },
) {
  const [tab, setTab] = useState<Tab>('export');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'export', label: 'Export' },
    { id: 'historique', label: 'Historique' },
    ...(canRead ? [{ id: 'configuration' as Tab, label: 'Configuration' }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Exports comptables"
        subtitle="Générez des paquets pour votre expert-comptable : ventes, TVA collectée, paiements, écritures."
      />

      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`h-10 px-4 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.id
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'export' && <ExportForm />}
      {tab === 'historique' && <ExportHistory />}
      {tab === 'configuration' && canRead && (
        <SalesAccountsSection canEdit={canEdit} canAssignFamily={canAssignFamily} />
      )}
    </div>
  );
}
