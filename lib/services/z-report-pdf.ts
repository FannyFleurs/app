import PDFDocument from 'pdfkit';
import type { DayReport } from './day-report';

/**
 * Rendu PDF du récapitulatif de journée (Z scellé ou X en cours), calqué sur
 * le modèle « Récapitulatif Z ». Format ticket centré sur une page A4.
 */

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'Mise en compte',
  payment_link: 'Lien de paiement',
  other: 'Autre',
};

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
const rate = (r: number) =>
  `${r.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR') : '—';

export interface RenderReportOptions {
  /** Rendu ticket 80 mm (pour impression réseau native) au lieu d'A4. */
  thermal?: boolean;
}

export async function renderReportPdf(
  r: DayReport,
  opts: RenderReportOptions = {},
): Promise<Buffer> {
  if (opts.thermal) return renderThermalReport(r);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    collectPdf(doc, resolve, reject);
    drawReport(doc, r);
    doc.end();
  });
}

/**
 * Rendu ticket 80 mm : deux passes (mesure de la hauteur du contenu sur une
 * page très haute, puis rendu à la hauteur exacte). Le contenu s'appuie sur
 * des helpers relatifs à la largeur de page (kv/hr/align center), il s'adapte
 * donc directement à la largeur ticket.
 */
async function renderThermalReport(r: DayReport): Promise<Buffer> {
  const WIDTH = 226; // ~80 mm
  const MARGIN = 10;

  const measure = new PDFDocument({ size: [WIDTH, 20000], margin: MARGIN });
  measure.on('data', () => { /* on jette la sortie de mesure */ });
  drawReport(measure, r);
  const height = Math.max(200, Math.ceil(measure.y + MARGIN));
  measure.end();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [WIDTH, height], margin: MARGIN });
    collectPdf(doc, resolve, reject);
    drawReport(doc, r);
    doc.end();
  });
}

function collectPdf(
  doc: PDFKit.PDFDocument,
  resolve: (b: Buffer) => void,
  reject: (e: unknown) => void,
) {
  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
}

function drawReport(doc: PDFKit.PDFDocument, r: DayReport): void {
  {
    const id = r.identity;

    // --- En-tête identité (centré) ---
    doc.font('Helvetica-Bold').fontSize(15).text(id.name || r.store_name, { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    const center = (s?: string | null) => { if (s) doc.text(s, { align: 'center' }); };
    center(id.line1);
    center(id.line2);
    center([id.zip, id.city, id.country].filter(Boolean).join(' ') || null);
    center(id.phone);
    if (id.siret) center(`Siret : ${id.siret}`);
    if (id.vat_number) center(`TVA : ${id.vat_number}`);
    center(id.website);
    doc.fillColor('#000');

    // --- Titre FINANCIER / Z|X ---
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(9).fillColor('#666').text('FINANCIER', { align: 'center' });
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(22).text(r.kind, { align: 'center' });
    doc.font('Helvetica').fontSize(10).text(id.name || r.store_name, { align: 'center' });

    // --- Bloc journée ---
    doc.moveDown(0.6); hr(doc); doc.moveDown(0.3);
    doc.fontSize(10);
    kv(doc, 'Numéro de journée', r.journee_number != null ? String(r.journee_number) : '—');
    kv(doc, 'Ouverture', dt(r.opened_at));
    kv(doc, 'Fermeture', r.kind === 'X' ? 'En cours' : dt(r.closed_at));
    kv(doc, 'Date impression', dt(r.printed_at));

    // --- Chiffres clés ---
    doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
    doc.font('Helvetica-Bold'); kv(doc, 'CA TOTAL', eur(r.totals.ca_ttc)); doc.font('Helvetica');
    kv(doc, 'CA HT', eur(r.totals.ca_ht));
    kv(doc, 'Ticket moyen TTC', eur(r.totals.ticket_moyen_ttc));
    if (r.totals.marge_brute_ht != null) kv(doc, 'Marge brute HT', eur(r.totals.marge_brute_ht));

    // --- TVA collectée ---
    if (r.tva_by_rate.length > 0) {
      doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
      for (const t of r.tva_by_rate) kv(doc, `TVA ${rate(t.rate)} collectée`, eur(t.tva));
      doc.moveDown(0.4);
      for (const t of r.tva_by_rate) kv(doc, `CA TTC ${rate(t.rate)}`, eur(t.ttc));
      doc.moveDown(0.4);
      for (const t of r.tva_by_rate) kv(doc, `CA HT ${rate(t.rate)}`, eur(t.ht));
    }

    // --- Réductions / offerts ---
    doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
    kv(doc, 'Total réduction', `-${eur(r.totals.discounts_total)}`);
    kv(doc, 'Total offerts', eur(r.totals.offerts_total));
    kv(doc, "Nombre d'offerts", String(r.totals.offerts_count));

    // --- Modes de règlement ---
    doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
    section(doc, 'Modes de règlement');
    for (const p of r.payments) {
      const label = PAYMENT_LABELS[p.method] ?? p.method;
      kv(doc, `${label} [${p.count}]`, eur(p.amount));
    }

    // --- Règlements de soldes « en compte » (hors CA) ---
    if (r.settlements.length > 0) {
      doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
      section(doc, 'Règlements en compte (hors CA)');
      for (const p of r.settlements) {
        const label = PAYMENT_LABELS[p.method] ?? p.method;
        kv(doc, `${label} [${p.count}]`, eur(p.amount));
      }
    }

    // --- Entrées d'argent / espèces ---
    doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
    section(doc, "Entrées d'argent");
    if (r.cash.entrees_argent > 0) kv(doc, "Entrées d'argent", eur(r.cash.entrees_argent));
    kv(doc, 'Fonds de caisse', eur(r.cash.fonds_de_caisse));
    kv(doc, 'Total espèce caisse à la fermeture', eur(r.cash.total_espece_fermeture));
    if (r.cash.counted != null) {
      kv(doc, 'Espèces comptées', eur(r.cash.counted));
      const v = r.cash.variance ?? 0;
      kv(doc, v === 0 ? 'Écart' : v > 0 ? 'Surplus' : 'Manquant', `${v >= 0 ? '+' : ''}${eur(v)}`);
    }
    kv(doc, 'Ouverture tiroir caisse sans ticket', String(r.cash.tiroir_sans_ticket));

    // --- Données par vendeur ---
    if (r.by_vendor.length > 0) {
      doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
      section(doc, 'Données par vendeur');
      for (const v of r.by_vendor) kv(doc, `${v.name} — CA TTC`, eur(v.ca_ttc));
    }

    // --- CA TTC Familles ---
    if (r.by_category.length > 0) {
      doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
      section(doc, 'CA TTC Familles');
      for (const c of r.by_category) kv(doc, c.name, eur(c.ca_ttc));
    }

    // --- CA TTC Modes de ventes ---
    if (r.by_mode.length > 0) {
      doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
      section(doc, 'CA TTC Modes de ventes');
      for (const m of r.by_mode) kv(doc, m.mode, eur(m.ca_ttc));
    }

    // --- Nombre de tickets ---
    doc.moveDown(0.5); hr(doc); doc.moveDown(0.3);
    section(doc, 'Nombre de tickets');
    kv(doc, 'Nombre de tickets normal', String(r.tickets.normal_count));
    kv(doc, 'Total ticket NORMAL', eur(r.tickets.normal_total));

    // --- Empreinte fiscale (Z uniquement) ---
    if (r.kind === 'Z' && r.fiscal_hash) {
      doc.moveDown(0.7); hr(doc); doc.moveDown(0.3);
      if (r.closed_by) kv(doc, 'Clôturée par', r.closed_by);
      doc.font('Helvetica-Bold').fontSize(9).text('Empreinte fiscale (hash de scellement)');
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#444').text(r.fiscal_hash);
      doc.moveDown(0.3);
      doc.fillColor('#666').fontSize(8).text(
        "Rapport généré à partir d'un événement fiscal append-only scellé en base. Toute modification " +
        'a posteriori est interdite par les déclencheurs Postgres et détectée par la vérification de la ' +
        'chaîne (art. 286, I, 3°bis du CGI).',
        { align: 'justify' },
      );
      doc.fillColor('#000');
    }
  }
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.font('Helvetica-Bold').fontSize(10).text(title);
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const y = doc.y;
  doc.text(label, left, y, { width: width * 0.62 });
  const labelHeight = doc.y - y;
  doc.text(value, left, y, { width, align: 'right' });
  doc.y = y + labelHeight;
}

function hr(doc: PDFKit.PDFDocument) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#CCC').lineWidth(0.5).stroke().strokeColor('#000');
}
