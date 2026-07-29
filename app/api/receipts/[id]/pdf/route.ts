import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { query } from '@/lib/db/client';
import { renderReceiptPdf, type ReceiptSnapshot, type OrgInfo } from '@/lib/services/receipt-pdf';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  // ?gift=1 → ticket « sans prix » (bon d'échange) : mêmes articles, sans
  // aucun montant ni total.
  const gift = new URL(_req.url).searchParams.get('gift') === '1';

  const r = await query<{
    id: string; number: string;
    snapshot: ReceiptSnapshot;
    fiscal_hash: string;
    sale_id: string;
  }>(
    `SELECT id, number, snapshot, fiscal_hash, sale_id
       FROM receipts WHERE id = $1 AND organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (r.rowCount === 0) return jsonError('NOT_FOUND', 404);

  const rec = r.rows[0]!;

  const ctx = await query<{
    org_name: string; org_legal: string; org_siret: string | null;
    org_vat: string | null; org_address: { line1?: string; zip?: string; city?: string } | null;
    org_phone: string | null;
    store_name: string | null; store_id: string; register_code: string | null;
    user_name: string | null;
  }>(
    `SELECT
        o.name AS org_name, o.legal_name AS org_legal, o.siret AS org_siret,
        o.vat_number AS org_vat,
        o.address AS org_address,
        (o.contact->>'phone') AS org_phone,
        st.name AS store_name, st.id AS store_id, rg.code AS register_code,
        u.full_name AS user_name
      FROM sales s
      JOIN organizations o ON o.id = s.organization_id
      JOIN stores st ON st.id = s.store_id
      JOIN registers rg ON rg.id = s.register_id
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [rec.sale_id],
  );
  const c = ctx.rows[0]!;
  const org: OrgInfo = {
    name: c.org_name, legal_name: c.org_legal,
    siret: c.org_siret, vat_number: c.org_vat,
    address: c.org_address, phone: c.org_phone,
  };

  const receiptSettings = await loadReceiptSettings(g.user.organizationId, c.store_id);

  const buf = await renderReceiptPdf(rec.snapshot, org, {
    fiscalHash: rec.fiscal_hash,
    storeName: c.store_name ?? undefined,
    registerCode: c.register_code ?? undefined,
    cashier: c.user_name ?? undefined,
    receipt: receiptSettings,
    giftReceipt: gift,
  });
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${gift ? 'bon-echange' : 'ticket'}-${rec.number}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
