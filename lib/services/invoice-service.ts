import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
        notes: string | null;
      }>(
        `SELECT id, store_id, customer_id, status,
                total_ht, total_tva, total_ttc, tva_breakdown, validated_at, notes
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
      // validated_at est renvoyé par node-postgres comme un Date (TIMESTAMPTZ),
      // pas une string — d'où le passage par new Date(...).toISOString().
      const serviceDate = new Date(s.validated_at).toISOString().slice(0, 10);

      // Insertion de la facture (status=paid car la vente est encaissée)
      const inv = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (organization_id, store_id, customer_id, sale_id, invoice_type,
            number, sequence_value, status,
            issue_date, service_date, due_date,
            total_ht, total_tva, total_ttc, tva_breakdown,
            payment_terms, notes, validated_at)
         VALUES ($1,$2,$3,$4,'standard',
                 $5,$6,'paid',
                 $7,$8,$7,
                 $9,$10,$11,$12,
                 $13,$14, now())
         RETURNING id`,
        [
          args.organizationId, s.store_id, customerId, s.id,
          number, seq.toString(),
          issueDate, serviceDate,
          s.total_ht, s.total_tva, s.total_ttc, JSON.stringify(s.tva_breakdown),
          args.paymentTerms ?? null, s.notes ?? null,
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

  /**
   * Facture de période « en compte » : regroupe PLUSIEURS ventes validées d'un
   * même client (non encore facturées) en une seule facture non soldée
   * (status='sent', échéance), et marque les ventes comme facturées. Événement
   * fiscal INVOICE_VALIDATED unique (amountTtcDelta=0 : les ventes ont déjà
   * cumulé leur montant).
   */
  static async createFromAccountSales(args: {
    organizationId: string;
    userId: string;
    customerId: string;
    saleIds: string[];
    dueDays?: number;
  }): Promise<{ invoice_id: string; number: string; total_ttc: number }> {
    return withTransaction(async (client) => {
      const salesRes = await client.query<{
        id: string; store_id: string; customer_id: string | null; status: string;
        total_ht: string; total_tva: string; total_ttc: string;
        tva_breakdown: { rate: number; base_ht: number; tva: number }[];
        account_invoice_id: string | null; receipt_number: string | null;
      }>(
        `SELECT id, store_id, customer_id, status, total_ht, total_tva, total_ttc,
                tva_breakdown, account_invoice_id, receipt_number
           FROM sales WHERE id = ANY($1::uuid[]) AND organization_id = $2 FOR UPDATE`,
        [args.saleIds, args.organizationId],
      );
      const sales = salesRes.rows;
      if (sales.length === 0) throw new Error('NO_SALES');
      for (const s of sales) {
        if (s.status !== 'validated') throw new Error('SALE_NOT_VALIDATED');
        if (s.customer_id !== args.customerId) throw new Error('CUSTOMER_MISMATCH');
        if (s.account_invoice_id) throw new Error('SALE_ALREADY_INVOICED');
      }
      const storeId = sales[0]!.store_id;
      const totalHt = round4(sales.reduce((a, s) => a + Number(s.total_ht), 0));
      const totalTva = round4(sales.reduce((a, s) => a + Number(s.total_tva), 0));
      const totalTtc = round4(sales.reduce((a, s) => a + Number(s.total_ttc), 0));

      const tvaMap = new Map<number, { rate: number; base_ht: number; tva: number }>();
      for (const s of sales) for (const b of s.tva_breakdown ?? []) {
        const e = tvaMap.get(b.rate) ?? { rate: b.rate, base_ht: 0, tva: 0 };
        e.base_ht += Number(b.base_ht); e.tva += Number(b.tva);
        tvaMap.set(b.rate, e);
      }
      const tvaBreakdown = Array.from(tvaMap.values()).map((e) => ({
        rate: e.rate, base_ht: round4(e.base_ht), tva: round4(e.tva), ttc: round4(e.base_ht + e.tva),
      }));

      const fiscal = new FiscalCore(client);
      const year = new Date().getUTCFullYear();
      const { value: seq, formatted: number } = await fiscal.nextDocumentNumber({
        organizationId: args.organizationId, kind: 'invoice', year, prefix: 'F',
      });
      const issueDate = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + (args.dueDays ?? 30) * 86400000).toISOString().slice(0, 10);

      const inv = await client.query<{ id: string }>(
        `INSERT INTO invoices
           (organization_id, store_id, customer_id, sale_id, invoice_type,
            number, sequence_value, status, issue_date, service_date, due_date,
            total_ht, total_tva, total_ttc, tva_breakdown, metadata, validated_at)
         VALUES ($1,$2,$3,NULL,'standard',$4,$5,'sent',$6,$6,$7,$8,$9,$10,$11,$12,now())
         RETURNING id`,
        [
          args.organizationId, storeId, args.customerId, number, seq.toString(),
          issueDate, dueDate, totalHt.toFixed(4), totalTva.toFixed(4), totalTtc.toFixed(4),
          JSON.stringify(tvaBreakdown),
          JSON.stringify({ period_invoice: true, sale_ids: sales.map((s) => s.id) }),
        ],
      );
      const invoiceId = inv.rows[0]!.id;

      const linesRes = await client.query<{
        sale_id: string; label: string; unit_price_ttc: string; quantity: string;
        tax_rate: string; tax_rate_code: string; line_ht: string; line_tva: string; line_ttc: string;
      }>(
        `SELECT sale_id, label, unit_price_ttc, quantity, tax_rate, tax_rate_code,
                line_ht, line_tva, line_ttc
           FROM sale_lines WHERE sale_id = ANY($1::uuid[]) ORDER BY sale_id, line_index`,
        [args.saleIds],
      );
      const receiptBySale = new Map(sales.map((s) => [s.id, s.receipt_number]));
      let idx = 0;
      for (const l of linesRes.rows) {
        const rate = Number(l.tax_rate);
        const unitHt = round4(Number(l.unit_price_ttc) / (1 + rate / 100));
        const label = `${l.label} · ${receiptBySale.get(l.sale_id) ?? 'ticket'}`;
        await client.query(
          `INSERT INTO invoice_lines
             (organization_id, invoice_id, line_index, label, quantity,
              unit_price_ht, discount_pct, tax_rate, tax_rate_code, line_ht, line_tva, line_ttc)
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,$10,$11)`,
          [args.organizationId, invoiceId, idx++, label, l.quantity, unitHt, rate, l.tax_rate_code, l.line_ht, l.line_tva, l.line_ttc],
        );
      }

      const event = await fiscal.recordEvent({
        organizationId: args.organizationId, storeId, userId: args.userId,
        eventType: 'INVOICE_VALIDATED', entityType: 'invoice', entityId: invoiceId,
        payload: {
          invoice_id: invoiceId, invoice_number: number, sale_ids: sales.map((s) => s.id),
          customer_id: args.customerId, issue_date: issueDate,
          totals: { ht: totalHt, tva: totalTva, ttc: totalTtc }, tva_breakdown: tvaBreakdown,
        },
        amountTtcDelta: 0,
      });
      await client.query(`UPDATE invoices SET fiscal_hash = $1, fiscal_event_id = $2 WHERE id = $3`,
        [event.currentHash, event.id, invoiceId]);
      await client.query(`UPDATE sales SET account_invoice_id = $1 WHERE id = ANY($2::uuid[])`,
        [invoiceId, args.saleIds]);

      return { invoice_id: invoiceId, number, total_ttc: round2(totalTtc) };
    });
  }

  /**
   * Solde une facture « en compte » : passe la facture en `paid` et crédite le
   * solde en compte du client du montant réglé (le solde était négatif car la
   * vente différée l'avait débité ; le règlement le ramène vers zéro). Le
   * montant peut différer du total de la facture (règlement partiel/arrondi).
   * Trace un événement fiscal PAYMENT_REGISTERED (amountTtcDelta = 0 : la vente
   * a déjà cumulé le CA).
   */
  static async settleInvoice(args: {
    organizationId: string;
    userId: string;
    invoiceId: string;
    amount: number;
    method?: string;
  }): Promise<{ invoice_id: string; number: string | null; new_balance: number }> {
    return withTransaction(async (client) => {
      const invRes = await client.query<{
        id: string; store_id: string; customer_id: string; number: string | null;
        status: string; total_ttc: string;
      }>(
        `SELECT id, store_id, customer_id, number, status, total_ttc
           FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.invoiceId, args.organizationId],
      );
      if (invRes.rowCount === 0) throw new Error('INVOICE_NOT_FOUND');
      const inv = invRes.rows[0]!;
      if (inv.status === 'paid') throw new Error('INVOICE_ALREADY_PAID');
      if (inv.status === 'cancelled') throw new Error('INVOICE_CANCELLED');

      const amount = round2(args.amount);
      if (!(amount > 0)) throw new Error('INVALID_AMOUNT');

      await client.query(
        `UPDATE invoices SET status = 'paid', updated_at = now() WHERE id = $1`,
        [inv.id],
      );

      // Crédite le solde en compte (le règlement réduit la dette du client).
      const balRes = await client.query<{ account_balance: string }>(
        `UPDATE customers
            SET account_balance = COALESCE(account_balance, 0) + $2,
                updated_at = now()
          WHERE id = $1
        RETURNING account_balance::text`,
        [inv.customer_id, amount],
      );
      const newBalance = Number(balRes.rows[0]?.account_balance ?? 0);

      const fiscal = new FiscalCore(client);
      const event = await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: inv.store_id,
        userId: args.userId,
        eventType: 'PAYMENT_REGISTERED',
        entityType: 'invoice',
        entityId: inv.id,
        payload: {
          invoice_id: inv.id,
          invoice_number: inv.number,
          customer_id: inv.customer_id,
          amount,
          method: args.method ?? 'account_settlement',
          invoice_total_ttc: Number(inv.total_ttc),
          new_account_balance: newBalance,
        },
        amountTtcDelta: 0,
      });
      // Conserve la trace de l'événement de règlement sur la facture.
      await client.query(
        `UPDATE invoices SET metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object('settled_event_id', $2::text, 'settled_amount', $3::numeric)
          WHERE id = $1`,
        [inv.id, event.id, amount],
      );

      return { invoice_id: inv.id, number: inv.number, new_balance: newBalance };
    });
  }

  /**
   * Règlement direct du solde « en compte » d'un client (depuis la fiche
   * client, caisse). Crédite le solde du montant réglé et solde au passage les
   * éventuelles factures de période en attente (les plus anciennes d'abord,
   * intégralement). Trace un unique événement fiscal PAYMENT_REGISTERED.
   */
  static async settleAccount(args: {
    organizationId: string;
    userId: string;
    customerId: string;
    amount: number;
    method?: string;
    storeId?: string | null;
  }): Promise<{ new_balance: number; settled_invoice_ids: string[] }> {
    return withTransaction(async (client) => {
      const custRes = await client.query<{ id: string; account_balance: string }>(
        `SELECT id, COALESCE(account_balance, 0)::text AS account_balance
           FROM customers WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
        [args.customerId, args.organizationId],
      );
      if (custRes.rowCount === 0) throw new Error('CUSTOMER_NOT_FOUND');

      const amount = round2(args.amount);
      if (!(amount > 0)) throw new Error('INVALID_AMOUNT');

      // ESPÈCES = opération de caisse : interdite si aucune caisse n'est
      // ouverte pour la boutique. On vérifie AVANT toute écriture (le throw
      // annule proprement la transaction : le compte n'est PAS soldé).
      let cashSessionId: string | null = null;
      if (args.method === 'cash') {
        if (args.storeId) {
          const sess = await client.query<{ id: string }>(
            `SELECT id FROM cash_sessions
              WHERE store_id = $1 AND organization_id = $2 AND status = 'open'
              ORDER BY opened_at DESC LIMIT 1`,
            [args.storeId, args.organizationId],
          );
          cashSessionId = sess.rows[0]?.id ?? null;
        }
        if (!cashSessionId) throw new Error('NO_OPEN_SESSION');
      }

      const balRes = await client.query<{ account_balance: string }>(
        `UPDATE customers
            SET account_balance = COALESCE(account_balance, 0) + $2,
                updated_at = now()
          WHERE id = $1
        RETURNING account_balance::text`,
        [args.customerId, amount],
      );
      const newBalance = Number(balRes.rows[0]?.account_balance ?? 0);

      // Solde les factures de période en attente, les plus anciennes d'abord,
      // tant que le montant réglé couvre intégralement chaque facture.
      const invs = await client.query<{ id: string; total_ttc: string }>(
        `SELECT id, total_ttc::text
           FROM invoices
          WHERE customer_id = $1
            AND organization_id = $2
            AND status IN ('validated','sent','partially_paid','overdue')
          ORDER BY COALESCE(issue_date, created_at::date) ASC, created_at ASC
          FOR UPDATE`,
        [args.customerId, args.organizationId],
      );
      let remaining = amount;
      const settled: string[] = [];
      for (const inv of invs.rows) {
        const ttc = Number(inv.total_ttc);
        if (remaining + 0.0001 >= ttc) {
          await client.query(
            `UPDATE invoices
                SET status = 'paid', updated_at = now(),
                    metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('settled_via', 'account')
              WHERE id = $1`,
            [inv.id],
          );
          remaining = round2(remaining - ttc);
          settled.push(inv.id);
        }
      }

      const fiscal = new FiscalCore(client);
      await fiscal.recordEvent({
        organizationId: args.organizationId,
        storeId: args.storeId ?? null,
        userId: args.userId,
        eventType: 'PAYMENT_REGISTERED',
        entityType: 'payment',
        entityId: null,
        payload: {
          customer_id: args.customerId,
          amount,
          method: args.method ?? 'account_settlement',
          settled_invoice_ids: settled,
          new_account_balance: newBalance,
        },
        amountTtcDelta: 0,
      });

      // Règlement EN ESPÈCES : l'argent entre dans le tiroir → entrée de caisse
      // ('in') sur la session ouverte (déjà validée plus haut), pour être compté
      // à la clôture et au X.
      if (cashSessionId) {
        await client.query(
          `INSERT INTO cash_movements
             (organization_id, cash_session_id, movement_type, amount, reason, user_id)
           VALUES ($1, $2, 'in', $3, $4, $5)`,
          [args.organizationId, cashSessionId, amount, 'Règlement compte client', args.userId],
        );
      }

      return { new_balance: newBalance, settled_invoice_ids: settled };
    });
  }
}
