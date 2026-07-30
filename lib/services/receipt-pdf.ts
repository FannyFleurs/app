import PDFDocument from 'pdfkit';
import { formatEUR, round2 } from './money';
import type { ReceiptSettings } from '@/lib/settings/receipt';

export interface ReceiptSnapshot {
  receipt_number: string;
  validated_at: string;
  totals: {
    total_ht: number;
    total_tva: number;
    total_ttc: number;
    total_discount: number;
  };
  tva_breakdown: { rate: number; base_ht: number; tva: number; ttc: number }[];
  lines: Array<{
    label: string;
    unit_price_ttc: number;
    quantity: number;
    discount_amount: number;
    tax_rate: number;
    line_ttc: number;
  }>;
  payments: { method: string; amount: number; given_amount?: number | null; reference?: string | null }[];
}

export interface OrgInfo {
  name: string;
  legal_name: string;
  siret?: string | null;
  vat_number?: string | null;
  address?: { line1?: string; zip?: string; city?: string; country?: string } | null;
  phone?: string | null;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'Différé client',
  other: 'Autre',
};

/**
 * Génère un PDF ticket 80 mm (largeur ~226pt). Renvoie un Buffer.
 * Aucune logique fiscale ici : on lit uniquement le snapshot figé.
 */
export async function renderReceiptPdf(
  snapshot: ReceiptSnapshot,
  org: OrgInfo,
  options: {
    fiscalHash: string;
    storeName?: string;
    registerCode?: string;
    cashier?: string;
    receipt?: ReceiptSettings;
    /** Ticket « sans prix » (bon d'échange) : liste quantité + désignation,
     *  sans aucun montant, sans totaux/TVA/paiements. */
    giftReceipt?: boolean;
  },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [226, 1200],
      margins: { top: 12, bottom: 12, left: 10, right: 10 },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const rs = options.receipt;
    const gift = options.giftReceipt === true;

    // Logo si configuré
    if (rs?.logo_data_url?.startsWith('data:image')) {
      try {
        const base64 = rs.logo_data_url.split(',')[1] ?? '';
        const buf = Buffer.from(base64, 'base64');
        const x = (doc.page.width - 60) / 2;
        doc.image(buf, x, doc.y, { fit: [60, 40], align: 'center' });
        doc.y += 42;
      } catch { /* ignore image errors */ }
    }

    // En-tête : uniquement le NOM DE LA BOUTIQUE (nom de la société / raison
    // sociale retiré à la demande du commerçant).
    const shopName = rs?.shop_name?.trim() || org.name;
    doc.font('Helvetica-Bold').fontSize(11).text(shopName, { align: 'center' });
    doc.font('Helvetica').fontSize(8);

    const address1 = rs?.address_line1?.trim() || org.address?.line1;
    if (address1) doc.text(address1, { align: 'center' });

    const zipCity = rs?.address_zip_city?.trim()
      || [org.address?.zip, org.address?.city].filter(Boolean).join(' ');
    if (zipCity) doc.text(zipCity, { align: 'center' });

    // Ordre demandé : téléphone AVANT le SIRET.
    const phone = rs?.phone?.trim() || org.phone;
    if (phone) doc.text(phone, { align: 'center' });

    const siret = rs?.siret?.trim() || org.siret;
    if (siret) doc.text(`SIRET ${siret}`, { align: 'center' });

    const vat = rs?.vat_number?.trim() || org.vat_number;
    if (vat) doc.text(`TVA ${vat}`, { align: 'center' });

    // Site web propre à la boutique (réglages ticket, spécifiques boutique).
    const website = rs?.website?.trim();
    if (website) doc.text(website, { align: 'center' });

    // NB : le message de remerciement (ex-« message de bienvenue ») est
    // désormais imprimé TOUT EN BAS du ticket (cf. fin de fonction).

    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(9)
       .text(`Ticket ${snapshot.receipt_number}`, { align: 'center' });
    doc.font('Helvetica').fontSize(8);
    const date = new Date(snapshot.validated_at);
    doc.text(date.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }), { align: 'center' });
    // Vendeur conservé ; nom de boutique + n° de caisse retirés du sous-ticket
    // (la boutique figure déjà en en-tête).
    if (options.cashier) doc.text(`Vendeur : ${options.cashier}`, { align: 'center' });

    // Ticket sans prix : bandeau bien visible.
    if (gift) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold').fontSize(11).text('TICKET SANS PRIX', { align: 'center' });
      doc.font('Helvetica').fontSize(8);
    }

    doc.moveDown(0.5);
    doc.text('-'.repeat(40), { align: 'center' });
    doc.moveDown(0.3);

    // Lignes
    doc.font('Helvetica').fontSize(8);
    if (gift) {
      // Sans prix : uniquement quantité + désignation.
      doc.font('Helvetica-Bold').text('QTE  DÉSIGNATION');
      doc.font('Helvetica');
      doc.moveDown(0.2);
      for (const l of snapshot.lines) {
        doc.text(`${formatQty(l.quantity)}  ${l.label}`);
      }
    } else {
      // Ligne : « qté  désignation » ........ montant brut (avant remise).
      // Si remise : sous-ligne « Remise x % » ........ -montant.
      for (const l of snapshot.lines) {
        const grossTtc = round2(l.unit_price_ttc * l.quantity);
        const left = doc.x;
        doc.text(`${formatQty(l.quantity)}  ${l.label}`, left, doc.y, { continued: true });
        doc.text(formatEUR(grossTtc), { align: 'right' });
        if (l.discount_amount > 0) {
          const pct = grossTtc > 0 ? (l.discount_amount / grossTtc) * 100 : 0;
          doc.text(`   Remise ${formatPct(pct)}`, left, doc.y, { continued: true });
          doc.text(`-${formatEUR(l.discount_amount)}`, { align: 'right' });
        }
      }
    }

    doc.moveDown(0.2);
    doc.text('-'.repeat(40), { align: 'center' });

    // Totaux / TVA / paiements : uniquement sur le ticket avec prix.
    if (!gift) {
      // Si des remises existent, on montre le sous-total et la remise avant le
      // total (remise bien lisible, comme demandé).
      if (snapshot.totals.total_discount > 0) {
        doc.font('Helvetica').fontSize(8);
        rowLine(doc, 'Sous-total', formatEUR(round2(snapshot.totals.total_ttc + snapshot.totals.total_discount)));
        rowLine(doc, 'Remise totale', `-${formatEUR(snapshot.totals.total_discount)}`);
      }
      doc.font('Helvetica-Bold').fontSize(10);
      rowLine(doc, 'TOTAL TTC', formatEUR(snapshot.totals.total_ttc));
      doc.font('Helvetica').fontSize(8);
      rowLine(doc, 'Dont HT', formatEUR(snapshot.totals.total_ht));
      rowLine(doc, 'Dont TVA', formatEUR(snapshot.totals.total_tva));

      if (rs?.show_tax_breakdown ?? true) {
        doc.moveDown(0.3);
        for (const t of snapshot.tva_breakdown) {
          rowLine(
            doc,
            `TVA ${t.rate}% (HT ${formatEUR(t.base_ht)})`,
            formatEUR(t.tva),
          );
        }
      }

      doc.moveDown(0.3);
      doc.text('-'.repeat(40), { align: 'center' });
      // Règlements. Pour les espèces avec sur-paiement (rendu monnaie saisi en
      // caisse), on affiche le montant DONNÉ puis le « Rendu ».
      let change = 0;
      for (const p of snapshot.payments) {
        const label = PAYMENT_LABELS[p.method] ?? p.method;
        if (p.method === 'cash' && p.given_amount != null && p.given_amount > p.amount) {
          change = round2(change + (p.given_amount - p.amount));
          rowLine(doc, label, formatEUR(p.given_amount));
        } else {
          rowLine(doc, label, formatEUR(p.amount));
        }
      }
      if (change > 0) rowLine(doc, 'Rendu', formatEUR(change));
    }

    // Code-barres du numéro de ticket
    if (rs?.show_barcode ?? true) {
      doc.moveDown(0.6);
      drawCode128(doc, snapshot.receipt_number);
    }

    // Mentions fiscales : uniquement sur le vrai ticket (le ticket sans prix
    // n'est pas le document fiscal — il ne porte ni prix ni empreinte). Elles
    // sont placées AVANT les messages personnalisés pour que le remerciement
    // reste tout en bas.
    if (!gift) {
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(7);
      doc.text('Mention : ticket disponible par email sur demande.', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Helvetica-Oblique').fontSize(6);
      doc.text(`Empreinte fiscale : ${options.fiscalHash.slice(0, 16)}…`, { align: 'center' });
      doc.text('Système conforme aux exigences d\'inaltérabilité (art. 286, I, 3°bis CGI)', {
        align: 'center',
      });
    }

    // Messages personnalisés TOUT EN BAS : pied de page puis remerciement
    // (« Merci de votre visite » par défaut). Les deux restent éditables dans
    // les réglages ticket, par boutique.
    if (rs?.footer_message?.trim()) {
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(8)
         .text(rs.footer_message.trim(), { align: 'center' });
    }
    if (rs?.welcome_message?.trim()) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Oblique').fontSize(9)
         .text(rs.welcome_message.trim(), { align: 'center' });
    }

    doc.end();
  });
}

/**
 * Dessine un code-barres Code-128 minimaliste (style "barres aléatoires
 * déterministes" basé sur le hash du texte) + le numéro lisible dessous.
 * Pas une implémentation Code-128 normée, mais imprime le numéro lisible
 * sous forme barrée — pour scan rapide en interne uniquement.
 */
function drawCode128(doc: PDFKit.PDFDocument, text: string) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const barWidth = 1.2;
  const totalBars = Math.floor(w / barWidth);
  const y = doc.y;
  const h = 26;
  // Hash déterministe pour répartition de barres pleines/vides
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  let x = doc.page.margins.left;
  for (let i = 0; i < totalBars; i++) {
    // 60% de barres pleines
    seed = (seed * 1103515245 + 12345) >>> 0;
    const isBar = (seed % 100) < 60;
    if (isBar) doc.rect(x, y, barWidth, h).fill('black');
    x += barWidth;
  }
  doc.fillColor('black');
  doc.font('Helvetica').fontSize(8);
  doc.y = y + h + 2;
  doc.text(text, { align: 'center' });
}

function rowLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  const y = doc.y;
  doc.text(label, doc.page.margins.left, y, { continued: true });
  doc.text(value, { align: 'right' });
}

function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/** Pourcentage de remise formaté « 30 % » / « 12,5 % » (sans décimales inutiles). */
function formatPct(p: number): string {
  const s = Number.isInteger(p) ? String(p) : p.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${s.replace('.', ',')} %`;
}
