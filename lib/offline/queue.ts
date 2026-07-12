'use client';

/**
 * File d'attente locale (IndexedDB) des ventes encaissées hors-ligne.
 * Chaque entrée est le payload complet à rejouer vers /api/sales/offline,
 * plus quelques méta pour l'affichage. Clé = client_ref (idempotence).
 */

export interface QueuedSale {
  client_ref: string;
  occurred_at: string;
  store_id: string;
  register_id: string;
  customer_id?: string | null;
  lines: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    label: string;
    unit_price_ttc: number;
    quantity: number;
    discount_amount?: number;
    tax_rate: number;
    tax_rate_code: string;
    metadata?: Record<string, unknown>;
  }>;
  payments: Array<{
    method: 'cash' | 'card' | 'check' | 'transfer' | 'gift_card' | 'credit_note' | 'deferred' | 'other';
    amount: number;
    given_amount?: number;
    reference?: string;
  }>;
  loyalty_redemption_amount?: number;
  /** Méta locales (affichage). */
  total_ttc: number;
  created_at: number;
}

const DB_NAME = 'webpos_offline';
const STORE = 'sales';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_ref' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  }));
}

export async function enqueueSale(sale: QueuedSale): Promise<void> {
  await tx('readwrite', (s) => s.put(sale));
  notify();
}

export async function allQueuedSales(): Promise<QueuedSale[]> {
  const rows = await tx<QueuedSale[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedSale[]>);
  return rows.sort((a, b) => a.created_at - b.created_at);
}

export async function removeQueuedSale(clientRef: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(clientRef));
  notify();
}

export async function queuedCount(): Promise<number> {
  try { return await tx<number>('readonly', (s) => s.count()); }
  catch { return 0; }
}

// --- Abonnement (pour l'UI : badge « N en attente ») ---
type Listener = () => void;
const listeners = new Set<Listener>();
export function onQueueChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() { listeners.forEach((l) => { try { l(); } catch { /* ignore */ } }); }
