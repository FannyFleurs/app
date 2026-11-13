import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { query } from '@/lib/db/client';
import { requirePermission } from '@/lib/auth/guards';
import { jsonError } from '@/lib/validation/api';
import { computeDayReport } from '@/lib/services/day-report';
import { formatEUR } from '@/lib/services/money';

export const runtime = 'nodejs';

/**
 * PDF du ticket de prélèvement automatique — repli pour les boutiques sans
 * imprimante CloudPRNT (impression navigateur), ouvert juste après le
 * scellement quand la clôture l'exige (voir ClosuresAdmin.tsx,
 * `withdrawal_needs_fallback`). Même contenu que le ticket StarPRNT
 * (buildAutoWithdrawalStarPrnt), en-tête réduit au nom de la boutique.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const g = await requirePermission('closures.daily');
  if ('response' in g) return g.response;

  const closure = await query<{
    business_date: string; store_id: string;
    cash_expected: string; cash_counted: string | null; cash_variance: string | null;
    fiscal_hash: string; sealed_at: string; closed_by_name: string;
  }>(
    `SELECT d.business_date, d.store_id,
            d.cash_expected::text, d.cash_counted::text, d.cash_variance::text,
            d.fiscal_hash, d.sealed_at, u.full_name AS closed_by_name
       FROM daily_closures d
       JOIN users u ON u.id = d.closed_by
      WHERE d.id = $1 AND d.organization_id = $2`,
    [params.id, g.user.organizationId],
  );
  if (closure.rowCount === 0) return jsonError('NOT_FOUND', 404);
  const c = closure.rows[0]!;

  const report = await computeDayReport({
    organizationId: g.user.organizationId,
    storeId: c.store_id,
    businessDate: c.business_date,
    kind: 'Z',
    printedAt: new Date().toISOString(),
    sealed: {
      closed_by: c.closed_by_name,
      sealed_at: c.sealed_at,
      fiscal_hash: c.fiscal_hash,
      cash_counted: c.cash_counted != null ? Number(c.cash_counted) : null,
      cash_variance: c.cash_variance != null ? Number(c.cash_variance) : null,
      cash_expected: Number(c.cash_expected),
    },
  });

  const shopName = report.identity.name || report.store_name;
  const cashBefore = Number((report.cash.total_espece_fermeture + report.cash.remise_banque).toFixed(2));
  const targetFloat = report.cash.fonds_de_caisse;
  const amount = report.cash.remise_banque;

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: [226, 600],
      margins: { top: 12, bottom: 12, left: 10, right: 10 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(11).text(shopName, { align: 'center' });

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).text('PRÉLÈVEMENT AUTOMATIQUE', { align: 'center' });

    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.3);

    const d = report.closed_at ? new Date(report.closed_at) : new Date();
    line(doc, 'Date', d.toLocaleDateString('fr-FR'));
    line(doc, 'Heure', d.toLocaleTimeString('fr-FR'));
    line(doc, 'Boutique', report.store_name);
    if (report.closed_by) line(doc, 'Clôture par', report.closed_by);
    line(doc, 'Motif', 'Clôture - fonds fixe');

    doc.moveDown(0.4);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.4);
    line(doc, 'Espèces comptées', formatEUR(cashBefore));
    line(doc, 'Fonds de caisse cible', formatEUR(targetFloat));

    doc.moveDown(0.4);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(14);
    line(doc, 'MONTANT PRÉLEVÉ', `- ${formatEUR(amount)}`);
    doc.font('Helvetica').fontSize(8);

    doc.moveDown(0.6);
    doc.font('Helvetica').fontSize(7);
    doc.text('Conserver ce reçu avec le bordereau de remise.', { align: 'center' });
    doc.moveDown(0.3);
    doc.text('Signature : ____________________', { align: 'left' });

    doc.moveDown(0.5);
    doc.font('Helvetica-Oblique').fontSize(6);
    doc.text(`Référence ${params.id.slice(0, 8)}`, { align: 'center' });

    doc.end();
  });

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="prelevement-${c.business_date}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function line(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y, { continued: true });
  doc.text(value, { align: 'right' });
}
