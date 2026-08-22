import { NextResponse } from 'next/server';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';
import { loadReceiptExtras } from '@/lib/services/receipt-extras';
import { loadScopedSettingValue } from '@/lib/settings/scoped-server';
import {
  PRINTER_KEY,
  mergePrinterDefaults,
  type PrinterSettings,
} from '@/lib/settings/printer';
import {
  type ReceiptSnapshot,
  type OrgInfo,
} from '@/lib/services/receipt-pdf';
import { buildNativeReceipt } from '@/lib/services/native-print/receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const g = await requirePermission('pos.use');

  if ('response' in g) {
    return g.response;
  }

  const url = new URL(req.url);

  const gift =
    url.searchParams.get('gift') === '1';

  const linesRaw =
    url.searchParams.get('lines');

  const giftLineIndices =
    linesRaw
      ? linesRaw
          .split(',')
          .map((x) => Number(x))
          .filter(
            (x) =>
              Number.isInteger(x) &&
              x >= 0,
          )
      : null;

  const receiptResult = await query<{
    id: string;
    number: string;
    snapshot: ReceiptSnapshot;
    fiscal_hash: string;
    sale_id: string;
  }>(
    `SELECT
       id,
       number,
       snapshot,
       fiscal_hash,
       sale_id
     FROM receipts
     WHERE id = $1
       AND organization_id = $2`,
    [
      params.id,
      g.user.organizationId,
    ],
  );

  if (receiptResult.rowCount === 0) {
    return NextResponse.json(
      { error: 'NOT_FOUND' },
      { status: 404 },
    );
  }

  const receipt =
    receiptResult.rows[0]!;

  const contextResult = await query<{
    org_name: string;
    org_legal: string;
    org_siret: string | null;
    org_vat: string | null;
    org_address: {
      line1?: string;
      zip?: string;
      city?: string;
    } | null;
    org_phone: string | null;
    store_id: string;
    user_name: string | null;
  }>(
    `SELECT
       o.name AS org_name,
       o.legal_name AS org_legal,
       o.siret AS org_siret,
       o.vat_number AS org_vat,
       o.address AS org_address,
       (o.contact->>'phone') AS org_phone,
       s.store_id AS store_id,
       u.full_name AS user_name
     FROM sales s
     JOIN organizations o
       ON o.id = s.organization_id
     JOIN users u
       ON u.id = s.user_id
     WHERE s.id = $1
       AND s.organization_id = $2`,
    [
      receipt.sale_id,
      g.user.organizationId,
    ],
  );

  if (contextResult.rowCount === 0) {
    return NextResponse.json(
      { error: 'SALE_NOT_FOUND' },
      { status: 404 },
    );
  }

  const context =
    contextResult.rows[0]!;

  const printerValue =
    await loadScopedSettingValue<PrinterSettings>(
      g.user.organizationId,
      PRINTER_KEY,
      context.store_id,
    );

  const printer =
    mergePrinterDefaults(
      printerValue,
    );

  if (
    printer.enabled !== true ||
    !printer.ip.trim()
  ) {
    return NextResponse.json(
      {
        error: 'NATIVE_PRINTER_NOT_CONFIGURED',
      },
      { status: 409 },
    );
  }

  const receiptSettings =
    await loadReceiptSettings(
      g.user.organizationId,
      context.store_id,
    );

  const extras =
    gift
      ? {
          customerName: null,
          loyalty: null,
        }
      : await loadReceiptExtras(
          g.user.organizationId,
          receipt.sale_id,
        );

  const org: OrgInfo = {
    name: context.org_name,
    legal_name: context.org_legal,
    siret: context.org_siret,
    vat_number: context.org_vat,
    address: context.org_address,
    phone: context.org_phone,
  };

  const payload =
    await buildNativeReceipt(
      receipt.snapshot,
      org,
      {
        fiscalHash:
          receipt.fiscal_hash,
        cashier:
          context.user_name,
        receipt:
          receiptSettings,
        giftReceipt:
          gift,
        giftLineIndices:
          giftLineIndices,
        customerName:
          extras.customerName,
        loyalty:
          extras.loyalty,
        paperWidthMm:
          printer.paper_width,
        language:
          'esc-pos',
      },
    );

  return NextResponse.json({
    ok: true,

    printer: {
      host: printer.ip.trim(),
      port: printer.port,
      paper_width:
        printer.paper_width,
    },

    receipt: {
      id: receipt.id,
      number: receipt.number,
      gift,
    },

    data_base64:
      Buffer.from(payload)
        .toString('base64'),

    bytes:
      payload.byteLength,
  });
}
