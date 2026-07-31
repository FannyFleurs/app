import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/guards';
import { parseJson } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { type ReceiptSnapshot, type OrgInfo } from '@/lib/services/receipt-pdf';
import { mergeReceiptDefaults, type ReceiptSettings } from '@/lib/settings/receipt';
import { resolveReceiptPrinter, enqueueJob } from '@/lib/services/cloudprnt/queue';
import { buildReceiptStarPrnt, STARPRNT_CONTENT_TYPE } from '@/lib/services/cloudprnt/receipt-star';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  store_id: z.string().uuid().optional(),
  logo_data_url: z.string().max(200_000).optional(),
  shop_name: z.string().max(120).optional(),
  address_line1: z.string().max(160).optional(),
  address_zip_city: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  siret: z.string().max(40).optional(),
  vat_number: z.string().max(40).optional(),
  website: z.string().max(200).optional(),
  welcome_message: z.string().max(120).optional(),
  footer_message: z.string().max(500).optional(),
  show_barcode: z.boolean().optional(),
  show_tax_breakdown: z.boolean().optional(),
  auto_print_receipt: z.boolean().optional(),
  auto_print_z: z.boolean().optional(),
}).passthrough();

function sampleSnapshot(): ReceiptSnapshot {
  return {
    receipt_number: 'T-TEST-000001',
    validated_at: '2026-07-31T12:34:56.000Z',
    totals: { total_ht: 40.91, total_tva: 4.09, total_ttc: 45, total_discount: 5 },
    tva_breakdown: [
      { rate: 20, base_ht: 10, tva: 2, ttc: 12 },
      { rate: 10, base_ht: 30.91, tva: 2.09, ttc: 33 },
    ],
    lines: [
      { label: 'Bouquet Roses Rouges', unit_price_ttc: 25, quantity: 1, discount_amount: 5, tax_rate: 10, line_ttc: 20 },
      { label: 'Composition deuil', unit_price_ttc: 13, quantity: 1, discount_amount: 0, tax_rate: 10, line_ttc: 13 },
      { label: 'Vase en verre', unit_price_ttc: 12, quantity: 1, discount_amount: 0, tax_rate: 20, line_ttc: 12 },
    ],
    payments: [{ method: 'cash', amount: 45, given_amount: 50 }],
    comment: 'Exemple de commentaire',
  };
}

/**
 * Imprime un ticket d'exemple (avec les réglages transmis) sur l'imprimante
 * TICKET CloudPRNT de la boutique. 409 si aucune imprimante configurée.
 */
export async function POST(req: Request) {
  const g = await requirePermission('settings.write');
  if ('response' in g) return g.response;
  const parsed = await parseJson(req, schema);
  if ('response' in parsed) return parsed.response;
  const { store_id: storeId, ...fields } = parsed.data;
  const settings: ReceiptSettings = mergeReceiptDefaults(fields as Partial<ReceiptSettings>);

  const printer = await resolveReceiptPrinter(g.user.organizationId, storeId ?? null);
  if (!printer) return NextResponse.json({ error: 'NO_PRINTER' }, { status: 409 });

  const orgRow = await query<{
    name: string; legal_name: string; siret: string | null; vat_number: string | null;
    address: { line1?: string; zip?: string; city?: string } | null; phone: string | null;
  }>(
    `SELECT name, legal_name, siret, vat_number, address, (contact->>'phone') AS phone
       FROM organizations WHERE id = $1`,
    [g.user.organizationId],
  );
  const o = orgRow.rows[0];
  const org: OrgInfo = {
    name: o?.name ?? 'HelloPos', legal_name: o?.legal_name ?? '',
    siret: o?.siret ?? null, vat_number: o?.vat_number ?? null,
    address: o?.address ?? null, phone: o?.phone ?? null,
  };

  const payload = await buildReceiptStarPrnt(sampleSnapshot(), org, {
    fiscalHash: 'TEST',
    cashier: g.user.fullName ?? 'Vendeur',
    receipt: settings,
    customerName: 'Client Exemple',
    loyalty: { earned: 4, balance: 40, redeemed: 0 },
    paperWidthMm: printer.paper_width,
  });
  await enqueueJob({
    organizationId: g.user.organizationId,
    printerId: printer.id,
    contentType: STARPRNT_CONTENT_TYPE,
    payload,
    title: 'Ticket de test (paramétrage)',
    userId: g.user.id,
  });

  return NextResponse.json({ ok: true, printer_label: printer.label });
}
