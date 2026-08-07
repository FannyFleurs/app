import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson, jsonError } from '@/lib/validation/api';
import { audit } from '@/lib/audit/log';
import {
  ACCOUNTING_ACCOUNTS_KEY,
  mergeAccountingAccounts,
  type AccountingAccounts,
} from '@/lib/settings/accounting';
import { groupByAccount, type SalesAccountRule } from '@/lib/services/accounting-mapping';

async function loadAccounts(orgId: string): Promise<AccountingAccounts> {
  const { rows } = await query<{ value: Partial<AccountingAccounts> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [orgId, ACCOUNTING_ACCOUNTS_KEY],
  );
  return mergeAccountingAccounts(rows[0]?.value ?? null);
}

export async function GET() {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;
  const { rows } = await query(
    `SELECT e.id, e.period_start::text, e.period_end::text, e.format,
            e.size_bytes::text, e.sha256, e.created_at,
            u.full_name AS generated_by
       FROM accounting_exports e
       JOIN users u ON u.id = e.generated_by
      WHERE e.organization_id = $1
      ORDER BY e.created_at DESC LIMIT 100`,
    [g.user.organizationId],
  );
  return NextResponse.json({ exports: rows });
}

const schema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format:       z.enum(['sales_csv', 'entries_csv', 'json', 'fec_like', 'accounts_csv']),
  /**
   * Boutiques retenues. Vide ou absent = toutes — le comptable d'une
   * organisation mono-boutique n'a rien à cocher, et celui d'un groupe peut
   * sortir un seul établissement ou plusieurs d'un coup.
   */
  store_ids:    z.array(z.string().uuid()).optional(),
});

/**
 * Génère un export comptable pour la période donnée et le stocke en base
 * (file_path = contenu inline base64, file_path / sha256 / size). Renvoie
 * l'identifiant pour téléchargement via /api/exports/accounting/[id].
 */
export async function POST(req: Request) {
  const g = await requirePermission('fiscal.export');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { period_start, period_end, format } = parsed.data;
  const storeIds = parsed.data.store_ids ?? [];
  // Filtre appliqué en SQL plutôt qu'après coup : sur une année de ventes, la
  // différence n'est pas cosmétique.
  const storeFilter = storeIds.length ? ' AND s.store_id = ANY($4::uuid[])' : '';
  const storeArgs: unknown[] = storeIds.length ? [storeIds] : [];

  if (period_end < period_start) return jsonError('INVALID_PERIOD', 400);

  let content = '';
  let mime = 'text/csv';

  if (format === 'sales_csv') {
    const sales = await query<{
      receipt_number: string; validated_at: Date;
      total_ht: string; total_tva: string; total_ttc: string;
      total_discount: string;
      cashier: string;
      customer: string | null;
    }>(
      `SELECT s.receipt_number, s.validated_at,
              s.total_ht::text, s.total_tva::text, s.total_ttc::text,
              s.total_discount::text,
              u.full_name AS cashier,
              COALESCE(c.company_name,
                NULLIF(TRIM(CONCAT(c.first_name,' ',c.last_name)), '')) AS customer
         FROM sales s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.organization_id = $1
          AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        ORDER BY s.validated_at`,
      [g.user.organizationId, period_start, period_end, ...storeArgs],
    );
    const header = ['Numéro', 'Date', 'Vendeur', 'Client', 'Total HT', 'TVA', 'Remises', 'Total TTC'];
    const lines = [header.join(';')].concat(sales.rows.map((s) => [
      s.receipt_number,
      new Date(s.validated_at).toISOString(),
      JSON.stringify(s.cashier),
      JSON.stringify(s.customer ?? ''),
      Number(s.total_ht).toFixed(2),
      Number(s.total_tva).toFixed(2),
      Number(s.total_discount).toFixed(2),
      Number(s.total_ttc).toFixed(2),
    ].join(';')));
    content = '﻿' + lines.join('\n');
  } else if (format === 'entries_csv') {
    // Écritures comptables agrégées par jour : Ventes / TVA / Caisse / CB
    const rows = await query<{
      day: Date;
      total_ttc: string; total_tva: string;
      cash_total: string; card_total: string;
    }>(
      `SELECT s.validated_at::date AS day,
              SUM(s.total_ttc)::text AS total_ttc,
              SUM(s.total_tva)::text AS total_tva,
              COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0)::text AS cash_total,
              COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount ELSE 0 END), 0)::text AS card_total
         FROM sales s
         LEFT JOIN payments p ON p.sale_id = s.id
        WHERE s.organization_id = $1
          AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        GROUP BY s.validated_at::date
        ORDER BY day`,
      [g.user.organizationId, period_start, period_end, ...storeArgs],
    );
    const accts = await loadAccounts(g.user.organizationId);
    const header = ['Date', 'Compte', 'Libellé', 'Débit', 'Crédit'];
    const out: string[][] = [];
    for (const r of rows.rows) {
      const d = new Date(r.day).toISOString().slice(0, 10);
      const ht = Number(r.total_ttc) - Number(r.total_tva);
      const tva = Number(r.total_tva);
      const cash = Number(r.cash_total);
      const card = Number(r.card_total);
      out.push([d, accts.sales,   'Ventes du jour',       '0.00', ht.toFixed(2)]);
      out.push([d, accts.tva_20,  'TVA collectée',         '0.00', tva.toFixed(2)]);
      out.push([d, accts.cash,    'Caisse — espèces',      cash.toFixed(2), '0.00']);
      out.push([d, accts.bank,    'Banque — CB',           card.toFixed(2), '0.00']);
    }
    content = '﻿' + [header.join(';')].concat(out.map((r) => r.join(';'))).join('\n');
  } else if (format === 'accounts_csv') {
    // Ventilation par compte de ventes : famille × taux × boutique, telle que
    // le comptable la relit dans son grand livre.
    const lines = await query<{
      store_id: string | null; store_name: string | null;
      category_id: string | null; category_name: string | null;
      vat_rate: string; ht: string; tva: string; ttc: string;
    }>(
      `SELECT s.store_id,
              st.name AS store_name,
              p.category_id,
              c.name AS category_name,
              sl.tax_rate::text AS vat_rate,
              SUM(sl.line_ht)::text  AS ht,
              SUM(sl.line_tva)::text AS tva,
              SUM(sl.line_ttc)::text AS ttc
         FROM sale_lines sl
         JOIN sales s ON s.id = sl.sale_id
         LEFT JOIN products p ON p.id = sl.product_id
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN stores st ON st.id = s.store_id
        WHERE s.organization_id = $1
          AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        GROUP BY s.store_id, st.name, p.category_id, c.name, sl.tax_rate
        ORDER BY st.name NULLS FIRST, c.name NULLS FIRST, sl.tax_rate`,
      [g.user.organizationId, period_start, period_end, ...storeArgs],
    );

    const rules = await query<SalesAccountRule>(
      `SELECT id, store_id, category_id, vat_rate::float8 AS vat_rate,
              account_code, account_label
         FROM accounting_sales_accounts
        WHERE organization_id = $1`,
      [g.user.organizationId],
    );
    const accts = await loadAccounts(g.user.organizationId);

    const totals = groupByAccount(
      lines.rows.map((r) => ({
        store_id: r.store_id, store_name: r.store_name,
        category_id: r.category_id, category_name: r.category_name,
        vat_rate: Number(r.vat_rate),
        ht: Number(r.ht), tva: Number(r.tva), ttc: Number(r.ttc),
      })),
      rules.rows,
      { code: accts.sales, label: 'Ventes' },
    );

    const header = ['Compte', 'Libellé', 'Montant HT', 'TVA', 'Montant TTC', 'Paramétré'];
    const out = totals.map((t) => [
      t.account_code,
      t.account_label,
      t.ht.toFixed(2), t.tva.toFixed(2), t.ttc.toFixed(2),
      // Colonne franche plutôt qu'un silence : une ligne « non » signale un
      // croisement qui n'a pas encore de compte, donc un paramétrage à compléter.
      t.fallback ? 'non' : 'oui',
    ]);
    const tot = totals.reduce((a, t) => ({
      ht: a.ht + t.ht, tva: a.tva + t.tva, ttc: a.ttc + t.ttc,
    }), { ht: 0, tva: 0, ttc: 0 });
    out.push(['', 'TOTAL', tot.ht.toFixed(2), tot.tva.toFixed(2), tot.ttc.toFixed(2), '']);
    content = '\ufeff' + [header.join(';')].concat(out.map((r) => r.join(';'))).join('\n');
  } else if (format === 'fec_like') {
    // Format pseudo-FEC : JournalCode|EcritureNum|EcritureDate|CompteNum|CompteLib|PieceRef|PieceDate|EcritureLib|Debit|Credit
    const sales = await query<{
      receipt_number: string; validated_at: Date;
      total_ttc: string; total_tva: string;
    }>(
      `SELECT s.receipt_number, s.validated_at, s.total_ttc::text, s.total_tva::text
         FROM sales s
        WHERE s.organization_id = $1 AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        ORDER BY s.validated_at`,
      [g.user.organizationId, period_start, period_end, ...storeArgs],
    );
    const header = [
      'JournalCode', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
      'PieceRef', 'PieceDate', 'EcritureLib', 'Debit', 'Credit',
    ];
    const accts = await loadAccounts(g.user.organizationId);
    const out = [header.join('|')];
    let num = 1;
    for (const s of sales.rows) {
      const dRaw = new Date(s.validated_at);
      const d = dRaw.toISOString().slice(0, 10).replace(/-/g, '');
      const ht = Number(s.total_ttc) - Number(s.total_tva);
      const tva = Number(s.total_tva);
      const ref = s.receipt_number;
      out.push(['VEN', String(num), d, accts.sales,  'Ventes', ref, d, `Ticket ${ref}`, '0.00', ht.toFixed(2)].join('|'));
      out.push(['VEN', String(num), d, accts.tva_20, 'TVA',    ref, d, `Ticket ${ref}`, '0.00', tva.toFixed(2)].join('|'));
      out.push(['VEN', String(num), d, accts.cash,   'Caisse', ref, d, `Ticket ${ref}`, Number(s.total_ttc).toFixed(2), '0.00'].join('|'));
      num++;
    }
    content = '﻿' + out.join('\n');
    mime = 'text/plain';
  } else {
    // JSON détaillé
    const data = await query(
      `SELECT s.id, s.receipt_number, s.validated_at,
              s.total_ht::text, s.total_tva::text, s.total_ttc::text,
              s.tva_breakdown,
              json_agg(json_build_object(
                'method', p.method, 'amount', p.amount
              )) AS payments
         FROM sales s
         LEFT JOIN payments p ON p.sale_id = s.id
        WHERE s.organization_id = $1
          AND s.status = 'validated'
          AND s.validated_at::date BETWEEN $2::date AND $3::date
          ${storeFilter}
        GROUP BY s.id
        ORDER BY s.validated_at`,
      [g.user.organizationId, period_start, period_end, ...storeArgs],
    );
    content = JSON.stringify({
      period: { start: period_start, end: period_end },
      sales: data.rows,
    }, null, 2);
    mime = 'application/json';
  }

  const buffer = Buffer.from(content, 'utf8');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const ins = await query<{ id: string }>(
    `INSERT INTO accounting_exports
       (organization_id, period_start, period_end, format, file_path, sha256, size_bytes, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      g.user.organizationId, period_start, period_end, format,
      // Stocke le contenu inline (data URL). À terme, plutôt un object storage.
      `data:${mime};base64,${buffer.toString('base64')}`,
      sha256, buffer.byteLength, g.user.id,
    ],
  );

  await audit({
    organizationId: g.user.organizationId, userId: g.user.id,
    action: 'accounting_export.generate',
    entityType: 'accounting_export',
    entityId: ins.rows[0]!.id,
    payload: { period_start, period_end, format, sha256 },
  });

  return NextResponse.json({ id: ins.rows[0]!.id, sha256, size: buffer.byteLength });
}
