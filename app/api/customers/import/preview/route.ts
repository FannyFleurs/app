import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { mergeWithDefaults, POS_UI_KEY, type PosUiSettings } from '@/lib/settings/pos-ui';
import {
  parseCustomerWorkbook, buildIndex, matchRow,
  type ExistingCustomer,
} from '@/lib/customers/import-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Aperçu (simulation) d'un import clients : lit le fichier, rapproche chaque
 * ligne des fiches existantes (e-mail, téléphone, nom) et renvoie le plan
 * (créations / mises à jour / lignes ambiguës / invalides) SANS rien écrire.
 */
export async function POST(req: Request) {
  const g = await requirePermission('customers.write');
  if ('response' in g) return g.response;

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'BAD_REQUEST', message: 'Fichier manquant.' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'NO_FILE', message: 'Sélectionnez un fichier Excel (.xlsx).' }, { status: 400 });
  }

  const uiRes = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [g.user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(uiRes.rows[0]?.value ?? null);
  const loyRate = ui.loyalty.per_euros_spent > 0
    ? ui.loyalty.euros_earned / ui.loyalty.per_euros_spent : 0.05;

  const { headerError, rows } = await parseCustomerWorkbook(Buffer.from(await file.arrayBuffer()), loyRate);
  if (headerError) return NextResponse.json({ error: 'BAD_FILE', message: headerError }, { status: 400 });

  const existing = await query<ExistingCustomer>(
    `SELECT id, email, phone, first_name, last_name, company_name
       FROM customers
      WHERE organization_id = $1 AND is_anonymized = FALSE AND archived_at IS NULL`,
    [g.user.organizationId],
  );
  const idx = buildIndex(existing.rows);

  const summary = { total: 0, create: 0, update: 0, ambiguous: 0, invalid: 0, with_points: 0, by_email: 0, by_phone: 0, by_name: 0 };
  const items: {
    row: number; label: string; action: string; matched_by?: string; points: number; error?: string;
  }[] = [];

  for (const row of rows) {
    summary.total++;
    if (row.error) {
      summary.invalid++;
      items.push({ row: row.rowNumber, label: row.label, action: 'invalid', points: 0, error: row.error });
      continue;
    }
    const m = matchRow(row, idx);
    if (m.action === 'update') {
      summary.update++;
      if (m.matchedBy === 'email') summary.by_email++;
      else if (m.matchedBy === 'téléphone') summary.by_phone++;
      else if (m.matchedBy === 'nom') summary.by_name++;
    } else if (m.action === 'ambiguous') summary.ambiguous++;
    else summary.create++;
    if (row.hasPoints && row.points > 0) summary.with_points++;
    items.push({
      row: row.rowNumber, label: row.label, action: m.action,
      matched_by: m.matchedBy, points: row.points,
    });
  }

  return NextResponse.json({ summary, items });
}
