'use client';

import MaJourneeClient from './MaJourneeClient';

interface Props {
  canClose: boolean;
  stores: { id: string; name: string }[];
  registers: { id: string; store_id: string; code: string; name: string }[];
}

// MaJourneeShell est désormais un simple passe-plat : la clôture de caisse
// est devenue une route à part entière (/closures) atteignable depuis le
// bouton « Actions sur ma journée » en bas de la barre latérale.
export default function MaJourneeShell(_props: Props) {
  return <MaJourneeClient />;
}
