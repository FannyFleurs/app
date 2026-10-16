import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { CUSTOMER_IMPORT_COLUMNS } from '@/lib/customers/import-columns';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Row {
  type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  siret: string | null;
  vat_number: string | null;
  address: { line1?: string; zip?: string; city?: string } | null;
  consent_email: boolean;
  consent_sms: boolean;
  internal_notes: string | null;
  loyalty_code: string | null;
  points_balance: string;
  account_balance: string;
}

/**
 * Export clients au format du modèle d'import (mêmes colonnes), pour
 * modifier rapidement en masse dans Excel puis réimporter — voir
 * /api/customers/import, option « Mode correction » : réimporter ce fichier
 * SANS le cocher cumulerait points/solde au lieu de les corriger.
 */
export async function GET() {
  const g = await requirePermission('customers.read');
  if ('response' in g) return g.response;

  const { rows } = await query<Row>(
    `SELECT c.type, c.first_name, c.last_name, c.company_name, c.email, c.phone,
            c.siret, c.vat_number, c.address, c.consent_email, c.consent_sms,
            c.internal_notes, c.loyalty_code,
            COALESCE((SELECT SUM(la.points_balance) FROM loyalty_accounts la
                       WHERE la.customer_id = c.id), 0)::text AS points_balance,
            c.account_balance::text
       FROM customers c
      WHERE c.organization_id = $1 AND c.is_anonymized = FALSE AND c.archived_at IS NULL
      ORDER BY c.created_at`,
    [g.user.organizationId],
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HelloPos';
  wb.created = new Date();

  const ws = wb.addWorksheet('Clients');
  ws.columns = CUSTOMER_IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF1ED' } };
    cell.alignment = { vertical: 'middle' };
  });
  head.height = 20;

  for (const r of rows) {
    const balance = Number(r.account_balance);
    ws.addRow({
      type: r.type,
      first_name: r.first_name ?? '',
      last_name: r.last_name ?? '',
      company_name: r.company_name ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      siret: r.siret ?? '',
      vat_number: r.vat_number ?? '',
      line1: r.address?.line1 ?? '',
      zip: r.address?.zip ?? '',
      city: r.address?.city ?? '',
      consent_email: r.consent_email ? 'oui' : 'non',
      consent_sms: r.consent_sms ? 'oui' : 'non',
      internal_notes: r.internal_notes ?? '',
      loyalty_code: r.loyalty_code ?? '',
      loyalty_points: Number(r.points_balance),
      // Convention de l'import : un solde dû s'exprime en positif.
      balance_due: balance < 0 ? Math.round(-balance * 100) / 100 : '',
    });
  }

  const info = wb.addWorksheet('Instructions');
  info.columns = [{ width: 90 }];
  const lines = [
    'Réimporter ce fichier',
    '',
    '1. Modifiez les cellules nécessaires (ex. corriger des points fidélité).',
    '2. Ne touchez pas aux colonnes « Type », « Prénom », « Nom », « Société » si vous ne voulez rien y changer — un client est retrouvé par son « Code fidélité » (le plus fiable), sinon son Email, son Téléphone, ou son Nom/Société : laissez ces colonnes telles quelles pour que HelloPos retrouve la bonne fiche.',
    '3. À l’import (Clients → Importer), cochez « Mode correction » : les colonnes Points fidélité et Solde dû sont alors traitées comme la valeur FINALE voulue — seul l’écart avec la valeur actuelle est appliqué. Une cellule que vous n’avez pas touchée ne produit aucune écriture.',
    '4. Sans cocher « Mode correction », ces deux colonnes s’additionnent au solde existant au lieu de le remplacer — à réserver à l’ajout de nouveaux clients depuis un autre système.',
  ];
  lines.forEach((t, i) => {
    const row = info.addRow([t]);
    if (i === 0) row.font = { bold: true, size: 14 };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="clients-hellopos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
