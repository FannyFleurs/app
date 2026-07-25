'use client';

import { allQueuedSales, removeQueuedSale, type QueuedSale } from './queue';

/**
 * Mode hors-ligne activé ? Activé PAR DÉFAUT : la caisse reste utilisable si le
 * réseau tombe (ventes enregistrées en local puis synchronisées à la reprise).
 * Désactivable explicitement avec NEXT_PUBLIC_OFFLINE_POS='0'.
 */
export function offlinePosEnabled(): boolean {
  return process.env.NEXT_PUBLIC_OFFLINE_POS !== '0';
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
      const res = await pushOne(sale);
      if (res === 'ok') { await removeQueuedSale(sale.client_ref); done++; }
      else if (res === 'skip') continue; // erreur métier propre à CETTE vente :
                                         // on la laisse en file et on continue
                                         // (ne bloque plus toute la file).
      else break;                        // 'stop' : réseau/serveur/journée
                                         // fermée → on réessaiera plus tard.
    }
  } finally {
    syncing = false;
  }
  return done;
}

type PushResult = 'ok' | 'skip' | 'stop';

async function pushOne(sale: QueuedSale): Promise<PushResult> {
  try {
    const r = await fetch('/api/sales/offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    if (r.ok) return 'ok';                // scellée (ou duplicate = déjà scellée)
    // 409 = journée fermée : concerne toute la file → on arrête la passe.
    if (r.status === 409) return 'stop';
    // Autre 4xx = erreur métier propre à cette vente : on la saute pour ne
    // pas bloquer les ventes suivantes (elle reste en file, retentée plus tard).
    if (r.status >= 400 && r.status < 500) return 'skip';
    return 'stop';                        // 5xx : on réessaiera toute la passe
  } catch {
    return 'stop';                        // hors-ligne / réseau coupé
  }
}
