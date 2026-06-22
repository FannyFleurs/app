import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

/**
 * Service de facturation.
 * Une facture validée est immuable (trigger fn_protect_validated_invoice) et
 * inscrit un événement fiscal INVOICE_VALIDATED dans la chaîne.
 *
 * Lorsqu'on facture une vente déjà validée, on n'incrémente pas le cumul
 * perpétuel TTC (amountTtcDelta = 0) — la vente l'a déjà fait.
 */
export class InvoiceService {
  /**
   * Génère une facture à partir d'une vente validée.
   * Le client peut être fourni en argument ou repris depuis la vente.
   */
  static async createFromSale(args: {
    organizationId: string;
    userId: string;
    saleId: string;
    customerId?: string;
    paymentTerms?: string | null;
  }): Promise<{ invoice_id: string; number: string; fiscal_hash: string }> {
    return withTransaction(async (client) => {
      // Verrouille la vente
      const sale = await client.query<{
        id: string; store_id: string; customer_id: string | null;
        status: string;
        total_ht: string; total_tva: string; total_ttc: string;
        tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
        validated_at: string;
      }>(
        `SELECT id, store_id, customer_id, status,
                total_ht, total_tva, total_ttc, tva_breakdown, validated_at
           FROM sales WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.saleId, args.organizationId],
      );
      if (sale.rowCount === 0) throw new Error('SALE_NOT_FOUND');
      const s = sale.rows[0]!;
      if (s.status !== 'validated') throw new Error('SALE_NOT_VALIDATED');

      const customerId = args.customerId ?? s.customer_id;
      if (!customerId) throw new Error('CUSTOMER_REQUIRED');

      // Refuse double facturation pour la même vente
      const existing = await client.query(
        `SELECT id FROM invoices WHERE sale_id = $1 AND status <> 'cancelled'`,
        [s.id],
      );
      if (existing.rowCount && existing.rowCount > 0) throw new Error('INVOICE_ALREADY_EXISTS');

      // Récupère les lignes (snapshot)
      const linesRes = await client.query<{
        line_index: number; label: string;
        unit_price_ttc: string; quantity: string;
        discount_amount: string; tax_rate: string; tax_rate_code: string;
        line_ht: string; line_tva: string; line_ttc: string;
      }>(
        `SELECT line_index, label, unit_price_ttc, quantity,
                discount_amount, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc
           FROM sale_lines WHERE sale_id = $1 ORDER BY line_index`,
        [s.id],
      );

      // Numérotation séquentielle
      const fiscal = new FiscalCore(client);
      const year = new Date().getUTCFullYear();
      const { value: seq, formatted: number } = await fiscal.nextDocumentNumber({
        organizationId: args.organizationId,
        kind: 'invoice',
        year,
        prefix: 'F',
      });

      const issueDate = new Date().toISOString().slice(0, 10);
      const serviceDate = s.validated_at.slice(0, 10);

      // Insertion de la facture (status=paid car la vente est encaissée)
      const inv = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (organization_id, store_id, customer_id, sale_id, invoice_type,
            number, sequence_value, status,
            issue_date, service_date, due_date,
            total_ht, total_tva, total_ttc, tva_breakdown,
            payment_terms, validated_at)
         VALUES ($1,$2,$3,$4,'standard',
                 $5,$6,'paid',
                 $7,$8,$7,
                 $9,$10,$11,$12,
                 $13, now())
         RETURNING id`,
        [
          args.organizationId, s.store_id, customerId, s.id,
          number, seq.toString(),
          issueDate, serviceDate,
          s.total_ht, s.total_tva, s.total_ttc, JSON.stringify(s.tva_breakdown),
          args.paymentTerms ?? null,
        ],
      );

      // Lignes facture (PU HT calculé à partir du PU TTC)
      for (const l of linesRes.rows) {
        const ttc = Number(l.unit_price_ttc);
        const rate = Number(l.tax_rate);
        const unitHt = Number((ttc / (1 + rate / 100)).toFixed(4));
        await client.query(
          `INSERT INTO invoice_lines
             (organization_id, invoice_id, line_index, label, quantity,
              unit_price_ht, discount_pct, tax_rate, tax_rate_code,
              line_ht, line_tva, line_ttc)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            args.organizationId, inv.rows[0]!.id, l.line_index, l.label, l.quantity,
            unitHt, 0, rate, l.tax_rate_code,
            l.line_ht, l.line_tva, l.line_ttc,
          ],
        );
      }

      // Snapshot pour l'événement fiscal
      const payload = {
        invoice_id: inv.rows[0]!.id,
        invoice_number: number,
        sale_id: s.id,
        customer_id: customerId,
        issue_date: issueDate,
        totals: {
          ht: Number(s.total_ht),
          tva: Number(s.total_tva),
          ttc: Number(s.total_ttc),
        },
        tva_breakdown: s.tva_breakdown,
      };

      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: s.store_id,
        userId: args.userId,
        eventType: 'INVOICE_VALIDATED',
        entityType: 'invoice',
        entityId: inv.rows[0]!.id,
        payload,
        amountTtcDelta: 0, // la vente a déjà cumulé le montant
      });

      // Pose le hash sur la facture
      await client.query(
        `UPDATE invoices SET fiscal_hash = $1, fiscal_event_id = $2
          WHERE id = $3`,
        [event.currentHash, event.id, inv.rows[0]!.id],
      );

      return {
        invoice_id: inv.rows[0]!.id,
        number,
        fiscal_hash: event.currentHash,
      };
    });
  }
}
