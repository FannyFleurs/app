import { query } from '@/lib/db/client';

export interface InvoicePdfLine {
  label: string;
  quantity: number;
  unit_price_ht: number;
  discount_pct: number;
  tax_rate: number;
  line_ht: number;
  line_tva: number;
  line_ttc: number;
}

/** Un groupe = les lignes d'UNE vente au sein d'une facture (mono ou période). */
export interface InvoiceSaleGroup {
  saleId: string | null;
  receipt: string | null;
  notes: string | null;
  lines: InvoicePdfLine[];
}

/**
 * Charge les lignes d'une facture, regroupées par vente d'origine (colonne
 * invoice_lines.sale_id). Pour chaque groupe on récupère le numéro de ticket
 * et le commentaire de la vente (sales.notes), afin de les afficher au sein
 * des lignes sur le PDF. Renvoie aussi la liste à plat pour compatibilité.
 *
 * `fallbackSaleId` / `fallbackNotes` couvrent les factures antérieures à la
 * colonne sale_id (lignes sans sale_id) : on rattache alors le commentaire de
 * la facture (repris de la vente mono) au groupe unique.
 */
export async function loadInvoiceGroups(
  invoiceId: string,
  fallbackSaleId: string | null,
  fallbackNotes: string | null,
): Promise<{ lines: InvoicePdfLine[]; groups: InvoiceSaleGroup[] }> {
  const res = await query<{
    sale_id: string | null;
    label: string; quantity: string; unit_price_ht: string; discount_pct: string;
    tax_rate: string; line_ht: string; line_tva: string; line_ttc: string;
  }>(
    `SELECT sale_id::text, label, quantity::text, unit_price_ht::text, discount_pct::text,
            tax_rate::text, line_ht::text, line_tva::text, line_ttc::text
       FROM invoice_lines WHERE invoice_id = $1 ORDER BY line_index`,
    [invoiceId],
  );

  const toLine = (l: (typeof res.rows)[number]): InvoicePdfLine => ({
    label: l.label,
    quantity: Number(l.quantity),
    unit_price_ht: Number(l.unit_price_ht),
    discount_pct: Number(l.discount_pct),
    tax_rate: Number(l.tax_rate),
    line_ht: Number(l.line_ht),
    line_tva: Number(l.line_tva),
    line_ttc: Number(l.line_ttc),
  });
  const lines = res.rows.map(toLine);

  // Métadonnées (ticket + commentaire) par vente.
  const saleIds = Array.from(new Set(res.rows.map((r) => r.sale_id).filter((x): x is string => !!x)));
  const meta = new Map<string, { receipt: string | null; notes: string | null }>();
  if (saleIds.length > 0) {
    const m = await query<{ id: string; receipt_number: string | null; notes: string | null }>(
      `SELECT id::text, receipt_number, notes FROM sales WHERE id = ANY($1::uuid[])`,
      [saleIds],
    );
    for (const row of m.rows) meta.set(row.id, { receipt: row.receipt_number, notes: row.notes });
  }

  // Construit les groupes en préservant l'ordre d'apparition.
  const groups: InvoiceSaleGroup[] = [];
  const byId = new Map<string, InvoiceSaleGroup>();
  for (const r of res.rows) {
    const key = r.sale_id ?? '__none__';
    let g = byId.get(key);
    if (!g) {
      const mm = r.sale_id ? meta.get(r.sale_id) : null;
      g = { saleId: r.sale_id, receipt: mm?.receipt ?? null, notes: mm?.notes ?? null, lines: [] };
      byId.set(key, g);
      groups.push(g);
    }
    g.lines.push(toLine(r));
  }

  // Facture ancienne (lignes sans sale_id) : un seul groupe → on lui rattache
  // le commentaire de la facture (repris de la vente mono).
  if (groups.length === 1 && groups[0]!.saleId === null) {
    groups[0]!.saleId = fallbackSaleId;
    if (fallbackNotes && !groups[0]!.notes) groups[0]!.notes = fallbackNotes;
  }

  return { lines, groups };
}
