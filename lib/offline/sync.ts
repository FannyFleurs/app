'use client';

import { allQueuedSales, removeQueuedSale, type QueuedSale } from './queue';

/** Mode hors-ligne activé ? (piloté par variable d'env, off par défaut). */
export function offlinePosEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE_POS === '1';
}

let syncing = false;

/**
 * Vide la file : rejoue chaque vente hors-ligne vers /api/sales/offline.
 * Idempotent côté serveur (client_ref) → sûr de relancer. Une vente qui
 * réussit (ou déjà scellée = duplicate) est retirée de la file. Une erreur
 * réseau stoppe la passe (on réessaiera au prochain online/intervalle).
 * Renvoie le nombre de ventes synchronisées.
 */
export async function syncOfflineSales(): Promise<number> {
  if (syncing || typeof navigator === 'undefined' || !navigator.onLine) return 0;
  syncing = true;
  let done = 0;
  try {
    const pending = await allQueuedSales();
    for (const sale of pending) {
      const ok = await pushOne(sale);
      if (ok) { await removeQueuedSale(sale.client_ref); done++; }
      else break; // erreur réseau : on arrête, on retentera plus tard
    }
  } finally {
    syncing = false;
  }
  return done;
}

async function pushOne(sale: QueuedSale): Promise<boolean> {
  try {
    const r = await fetch('/api/sales/offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    if (r.ok) return true;               // scellée (ou duplicate = déjà scellée)
    // 409 journée fermée / 4xx métier : on garde la vente en file (l'admin
    // rouvrira la journée). On ne boucle pas dessus indéfiniment ici : on
    // s'arrête pour ne pas spammer, elle repartira à la prochaine passe.
    if (r.status >= 400 && r.status < 500) return false;
    return false;                         // 5xx : on réessaiera
  } catch {
    return false;                         // hors-ligne / réseau coupé
  }
}
