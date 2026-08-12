import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db/client';
import { choisirImprimante } from './printer-choice';

export interface CloudPrntPrinter {
  id: string;
  organization_id: string;
  store_id: string | null;
  mac: string;
  label: string;
  role: string;
  poll_token: string | null;
  enabled: boolean;
  /** Largeur papier en mm (imprimante ticket) : 58 ou 80. */
  paper_width?: number;
}

/** Normalise une adresse MAC : minuscules, séparateurs retirés. */
export function normalizeMac(mac: string): string {
  return mac.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

/** Imprimante ÉTIQUETTES de la boutique. Voir `choisirImprimante`. */
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
  return choisirImprimante(rows, storeId);
}

/** Imprimante TICKET de la boutique. Voir `choisirImprimante`. */
export async function resolveReceiptPrinter(
  organizationId: string,
  storeId?: string | null,
): Promise<CloudPrntPrinter | null> {
  const { rows } = await query<CloudPrntPrinter>(
    `SELECT id, organization_id, store_id, mac, label, role, poll_token, enabled, paper_width
       FROM cloudprnt_printers
      WHERE organization_id = $1 AND role = 'receipt' AND enabled = TRUE`,
    [organizationId],
  );
  return choisirImprimante(rows, storeId);
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
