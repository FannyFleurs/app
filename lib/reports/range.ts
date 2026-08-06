import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Période et boutique communes à tous les rapports.
 *
 * Centralisé pour que chaque rapport lise les mêmes paramètres, avec la même
 * validation. La définition du jour reste propre à chaque rapport : selon la
 * source, la date pertinente est celle de la vente, de l'avoir ou de l'émission
 * d'une carte — mais toujours ramenée en heure locale par `localDay()`, pour
 * qu'un événement de 23 h 50 appartienne au jour où il a eu lieu et non au
 * lendemain UTC.
 */

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  store_id: z.string().uuid().optional().nullable(),
});

export interface ReportRange {
  from: string;
  to: string;
  storeId: string | null;
  /** $1 organisation, $2 début, $3 fin, et $4 boutique si filtrée. */
  args: unknown[];
}

/** Jour local d'une colonne d'horodatage. */
export function localDay(column: string): string {
  return `(${column} AT TIME ZONE 'Europe/Paris')::date`;
}

export function reportRange(
  req: Request,
  organizationId: string,
): ReportRange | { response: NextResponse } {
  const url = new URL(req.url);
  const parsed = schema.safeParse({
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to'),
    store_id: url.searchParams.get('store_id') || undefined,
  });
  if (!parsed.success) {
    return { response: NextResponse.json({ error: 'INVALID_PARAMS' }, { status: 400 }) };
  }
  const { from, to } = parsed.data;
  const storeId = parsed.data.store_id ?? null;

  const args: unknown[] = [organizationId, from, to];
  if (storeId) args.push(storeId);

  return { from, to, storeId, args };
}
