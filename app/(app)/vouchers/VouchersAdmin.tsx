'use client';

import PageHeader from '@/components/PageHeader';

import { useState } from 'react';
import GiftCardsAdmin from '../gift-cards/GiftCardsAdmin';
import CreditNotesList from '../credit-notes/CreditNotesList';

/**
 * Page unifiée Avoirs + Cartes cadeaux, avec deux onglets.
 * Les composants existants sont réutilisés tels quels — pas de duplication.
 */
export default function VouchersAdmin() {
  const [tab, setTab] = useState<'gift_cards' | 'credit_notes'>('gift_cards');

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 md:px-8 pt-6 md:pt-8">
        <PageHeader
          title="Avoirs &amp; cartes cadeaux"
          subtitle="Gérez vos cartes cadeaux émises et les avoirs (remboursements différés)."
        />
        <div className="mt-5 flex gap-1 border-b border-border">
          <TabButton active={tab === 'gift_cards'}    onClick={() => setTab('gift_cards')}>
            Cartes cadeaux
          </TabButton>
          <TabButton active={tab === 'credit_notes'}  onClick={() => setTab('credit_notes')}>
            Avoirs
          </TabButton>
        </div>
      </div>

      {/* Les sous-pages portent déjà leur propre p-8 / espacements. On les
          rend telles quelles dans la div scrollable. */}
      <div className="-mt-4">
        {tab === 'gift_cards'    ? <GiftCardsAdmin />    : null}
        {tab === 'credit_notes'  ? <CreditNotesList />   : null}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'text-accent-deep' : 'border-transparent text-ink-soft hover:text-ink'
      }`}
      style={active ? { borderColor: 'var(--primary)' } : undefined}
    >
      {children}
    </button>
  );
}
