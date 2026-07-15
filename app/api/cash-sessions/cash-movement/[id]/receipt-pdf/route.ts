import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { formatEUR } from '@/lib/services/money';
import { loadReceiptSettings } from '@/lib/settings/receipt-server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('pos.use');
  if ('response' in g) return g.response;

  const { rows } = await query<{
    id: string; movement_type: 'in' | 'out';
    amount: string; reason: string; created_at: string;
    user_name: string;
    store_name: string;
    store_id: string;
    register_code: string;
    org_name: string;
  }>(
    `SELECT cm.id, cm.movement_type, cm.amount::text, cm.reason, cm.created_at,
            u.full_name AS user_name,
            st.name AS store_name,
            st.id AS store_id,
            rg.code AS register_code,
            o.name AS org_name
       FROM cash_movements cm
       JOIN cash_sessions cs ON cs.id = cm.cash_session_id
       JOIN stores st ON st.id = cs.store_id
       JOIN registers rg ON rg.id = cs.register_id
       JOIN users u ON u.id = cm.user_id
       JOIN organizations o ON o.id = cm.organization_id
      WHERE cm.id = $1 AND cm.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (rows.length === 0) return jsonError('NOT_FOUND', 404);
  const m = rows[0]!;

  const rs = await loadReceiptSettings(g.user.organizationId, m.store_id);
  const isBankDeposit = m.movement_type === 'out' && /banque/i.test(m.reason);

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [226, 600],
      margins: { top: 12, bottom: 12, left: 10, right: 10 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const shopName = rs.shop_name?.trim() || m.org_name;
    doc.font('Helvetica-Bold').fontSize(11).text(shopName, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    if (rs.address_line1) doc.text(rs.address_line1, { align: 'center' });
    if (rs.address_zip_city) doc.text(rs.address_zip_city, { align: 'center' });
    if (rs.siret) doc.text(`SIRET ${rs.siret}`, { align: 'center' });

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12)
       .text(isBankDeposit ? 'REMISE EN BANQUE' : (m.movement_type === 'out' ? 'SORTIE CAISSE' : 'ENTRÉE CAISSE'),
            { align: 'center' });

    doc.moveDown(0.3);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(9);
    const date = new Date(m.created_at);
    line(doc, 'Date', date.toLocaleDateString('fr-FR'));
    line(doc, 'Heure', date.toLocaleTimeString('fr-FR'));
    line(doc, 'Boutique', m.store_name);
    line(doc, 'Caisse', m.register_code);
    line(doc, 'Vendeur', m.user_name);
    line(doc, 'Motif', m.reason);

    doc.moveDown(0.4);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(14);
    line(doc, 'MONTANT', `${m.movement_type === 'out' ? '-' : '+'} ${formatEUR(Number(m.amount))}`);
    doc.font('Helvetica').fontSize(8);

    if (isBankDeposit) {
      doc.moveDown(0.6);
      doc.font('Helvetica').fontSize(7);
      doc.text('Conserver ce reçu avec le bordereau de remise.', { align: 'center' });
      doc.moveDown(0.3);
      doc.text('Signature : ____________________', { align: 'left' });
    }

    doc.moveDown(0.5);
    doc.font('Helvetica-Oblique').fontSize(6);
    doc.text(`Référence ${m.id.slice(0, 8)}`, { align: 'center' });

    doc.end();
  });

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recu-${m.id.slice(0, 8)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function line(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y, { continued: true });
  doc.text(value, { align: 'right' });
}
