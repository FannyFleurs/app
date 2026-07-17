import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db/client';

export interface CloudPrntPrinter {
  id: string;
  organization_id: string;
  store_id: string | null;
  mac: string;
  label: string;
  role: string;
  poll_token: string | null;
  enabled: boolean;
}

/** Normalise une adresse MAC : minuscules, séparateurs retirés. */
export function normalizeMac(mac: string): string {
  return mac.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

/**
 * Résout l'imprimante étiquettes à utiliser pour une organisation :
 *   1. imprimante rattachée à la boutique du poste (si storeId),
 *   2. sinon imprimante « organisation » (store_id NULL),
 *   3. sinon l'unique imprimante étiquettes active.
 */
export async function resolveLabelPrinter(
  organizationId: string,
  storeId?: string | null,
): Promise<CloudPrntPrinter | null> {
  const { rows } = await query<CloudPrntPrinter>(
    `SELECT id, organization_id, store_id, mac, label, role, poll_token, enabled
       FROM cloudprnt_printers
      WHERE organization_id = $1 AND role = 'label' AND enabled = TRUE`,
    [organizationId],
  );
  if (rows.length === 0) return null;
  if (storeId) {
    const forStore = rows.find((p) => p.store_id === storeId);
    if (forStore) return forStore;
  }
  const orgWide = rows.find((p) => p.store_id === null);
  if (orgWide) return orgWide;
  return rows[0]!;
}

/** Ajoute un job dans la file. Renvoie le jeton du job. */
export async function enqueueJob(args: {
  organizationId: string;
  printerId: string;
  contentType: string;
  payload: Buffer;
  title?: string;
  userId?: string | null;
}): Promise<{ id: string; token: string }> {
  const token = randomUUID();
  const { rows } = await query<{ id: string }>(
    `INSERT INTO cloudprnt_jobs
       (organization_id, printer_id, token, content_type, payload, title, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [args.organizationId, args.printerId, token, args.contentType, args.payload, args.title ?? null, args.userId ?? null],
  );
  return { id: rows[0]!.id, token };
}
