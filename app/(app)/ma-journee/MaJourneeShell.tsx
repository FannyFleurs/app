'use client';

import { useState } from 'react';
import MaJourneeClient from './MaJourneeClient';
import ClosuresAdmin from '../closures/ClosuresAdmin';

interface Props {
  canClose: boolean;
  stores: { id: string; name: string }[];
  registers: { id: string; store_id: string; code: string; name: string }[];
}

export default function MaJourneeShell({ canClose, stores, registers }: Props) {
  const [tab, setTab] = useState<'sales' | 'closure'>('sales');

  return (
    <div>
      <div className="px-8 pt-6 flex gap-1 border-b border-border bg-white sticky top-0 z-10">
        <button
          onClick={() => setTab('sales')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'sales' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft hover:text-ink'
          }`}
        >
          Ventes du jour
        </button>
        {canClose && (
          <button
            onClick={() => setTab('closure')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'closure' ? 'border-sage text-accent-deep' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            Clôture de caisse
          </button>
        )}
      </div>
      {tab === 'sales' ? <MaJourneeClient /> : <ClosuresAdmin stores={stores} registers={registers} />}
    </div>
  );
}
