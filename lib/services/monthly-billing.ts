import { query } from '@/lib/db/client';
import { InvoiceService } from './invoice-service';

export interface MonthlyBillingResult {
  organization_id: string;
  generated: Array<{ customer_id: string; customer_name: string; invoice_id: string; number: string; total_ttc: number; sale_count: number }>;
  skipped: Array<{ customer_id: string; customer_name: string; reason: string }>;
}

/**
 * Génère les factures de période « mensuelles » d'une organisation : pour
 * chaque client marqué `billing_frequency = 'monthly'`, regroupe TOUS ses
 * tickets « en compte » validés non encore facturés en une facture de période
 * unique (conditions de règlement / échéance issues de la fiche client).
 *
 * Idempotent : une vente facturée reçoit `account_invoice_id`, donc un second
 * passage ne la refacture pas (aucun doublon).
 */
export async function runMonthlyBillingForOrg(
  organizationId: string,
  userId: string,
): Promise<MonthlyBillingResult> {
  const result: MonthlyBillingResult = { organization_id: organizationId, generated: [], skipped: [] };

  const customers = await query<{ id: string; name: string | null }>(
    `SELECT id, COALESCE(company_name, NULLIF(TRIM(CONCAT(first_name,' ',last_name)), '')) AS name
       FROM customers
      WHERE organization_id = $1
        AND billing_frequency = 'monthly'
        AND is_anonymized = FALSE`,
    [organizationId],
  );

  for (const c of customers.rows) {
    const name = c.name || 'Client';
    // Tickets « en compte » validés non facturés (mêmes critères que la
    // facturation manuelle).
    const sales = await query<{ id: string }>(
      `SELECT s.id
         FROM sales s
        WHERE s.customer_id = $1
          AND s.organization_id = $2
          AND s.status = 'validated'
          AND s.account_invoice_id IS NULL
          AND EXISTS (SELECT 1 FROM payments p
                        WHERE p.sale_id = s.id AND p.method = 'deferred')
        ORDER BY s.validated_at ASC`,
      [c.id, organizationId],
    );
    const saleIds = sales.rows.map((s) => s.id);
    if (saleIds.length === 0) {
      result.skipped.push({ customer_id: c.id, customer_name: name, reason: 'Aucun ticket à facturer' });
      continue;
    }
    try {
      const out = await InvoiceService.createFromAccountSales({
        organizationId, userId, customerId: c.id, saleIds,
      });
      result.generated.push({
        customer_id: c.id, customer_name: name,
        invoice_id: out.invoice_id, number: out.number, total_ttc: out.total_ttc,
        sale_count: saleIds.length,
      });
    } catch (e) {
      result.skipped.push({ customer_id: c.id, customer_name: name, reason: (e as Error).message });
    }
  }

  return result;
}
