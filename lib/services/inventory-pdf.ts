import PDFDocument from 'pdfkit';

/**
 * Liste des écarts d'inventaire, en PDF.
 *
 * L'impression passait par `window.print()` sur la page : on obtenait l'écran
 * tel quel — champs de saisie compris, colonnes coupées à la largeur du
 * navigateur, aucune reprise d'en-tête d'une page à l'autre. Pour un document
 * qu'on emporte dans les rayons et qu'on archive, il faut une vraie mise en
 * page paginée, d'où ce rendu serveur.
 */

export interface InventoryPdfHeader {
  label: string;
  store_name: string;
  created_at: string;
  status: string;
}

export interface InventoryPdfLine {
  product_name: string;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
  expected_qty: string;
  counted_qty: string;
  purchase_price_ht: string | null;
}

const MARGE = 40;
/** Colonnes : largeurs fixes, pour que l'en-tête et les lignes s'alignent. */
const COLS = [
  { titre: 'Produit',   largeur: 190, align: 'left'  as const },
  { titre: 'SKU / code', largeur: 95, align: 'left'  as const },
  { titre: 'Attendu',   largeur: 55,  align: 'right' as const },
  { titre: 'Compté',    largeur: 55,  align: 'right' as const },
  { titre: 'Écart',     largeur: 50,  align: 'right' as const },
  { titre: 'Valeur',    largeur: 70,  align: 'right' as const },
];

/**
 * Coupe un texte à la largeur d'une colonne, avec une ellipse.
 *
 * `lineBreak: false` et l'option `ellipsis` de pdfkit ne suffisent pas : un
 * SKU à tirets se coupait quand même, et sa fin retombait sur la ligne
 * suivante, au milieu du nom de famille du produit. On tranche donc nous-mêmes,
 * en mesurant avec la police réellement employée.
 */
function tronque(doc: PDFKit.PDFDocument, texte: string, largeur: number): string {
  if (doc.widthOfString(texte) <= largeur) return texte;
  let out = texte;
  while (out.length > 1 && doc.widthOfString(out + '…') > largeur) out = out.slice(0, -1);
  return out + '…';
}

const nb = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, ''));
const eur = (v: number) =>
  `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export async function renderInventoryPdf(
  inv: InventoryPdfHeader, lines: InventoryPdfLine[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGE, layout: 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bas = doc.page.height - MARGE - 24;

    const enTeteColonnes = () => {
      // `y` figé AVANT la boucle : chaque `doc.text` avance le curseur, et les
      // six intitulés se retrouvaient empilés en escalier au lieu de former
      // une ligne.
      const y = doc.y;
      let x = MARGE;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555');
      for (const c of COLS) {
        doc.text(c.titre.toUpperCase(), x, y,
          { width: c.largeur, align: c.align, lineBreak: false, ellipsis: true });
        x += c.largeur;
      }
      doc.y = y + 12;
      doc.fillColor('#000');
      trait(doc);
      doc.moveDown(0.3);
    };

    // --- En-tête du document
    doc.font('Helvetica-Bold').fontSize(16).text(inv.label);
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`${inv.store_name} · créé le ${new Date(inv.created_at).toLocaleString('fr-FR')}`);
    doc.text(`${lines.length} ligne(s) avec écart · édité le ${new Date().toLocaleString('fr-FR')}`);
    doc.fillColor('#000').moveDown(0.8);
    enTeteColonnes();

    let totalValeur = 0;

    for (const l of lines) {
      const attendu = Number(l.expected_qty);
      const compte = Number(l.counted_qty);
      const ecart = Number((compte - attendu).toFixed(3));
      const valeur = Number((ecart * Number(l.purchase_price_ht ?? 0)).toFixed(2));
      totalValeur += valeur;

      // Saut de page AVANT d'écrire la ligne : une ligne coupée en deux est
      // illisible, et l'en-tête doit être repris pour rester lisible seule.
      if (doc.y > bas - 30) {
        doc.addPage();
        enTeteColonnes();
      }

      const y = doc.y;
      let x = MARGE;
      const cellule = (texte: string, i: number, gras = false, couleur = '#000') => {
        doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(couleur);
        doc.text(tronque(doc, texte, COLS[i]!.largeur - 6), x, y,
          { width: COLS[i]!.largeur, align: COLS[i]!.align, lineBreak: false });
        x += COLS[i]!.largeur;
      };

      cellule(l.product_name, 0, true);
      cellule(l.sku ?? l.barcode ?? '—', 1, false, '#555');
      cellule(nb(attendu), 2);
      cellule(nb(compte), 3);
      // L'écart est ce qu'on vient vérifier : signe explicite, couleur franche.
      cellule(`${ecart > 0 ? '+' : ''}${nb(ecart)}`, 4, true, ecart < 0 ? '#B3261E' : '#2E7D32');
      cellule(eur(valeur), 5, false, valeur < 0 ? '#B3261E' : '#000');

      // La famille sous le nom du produit : elle situe l'article dans le
      // magasin, c'est ce qui guide le déplacement dans les rayons.
      doc.font('Helvetica').fontSize(7.5).fillColor('#777');
      doc.text(tronque(doc, l.category_name ?? '—', COLS[0]!.largeur - 6), MARGE, y + 11,
        { width: COLS[0]!.largeur, lineBreak: false });
      doc.fillColor('#000');
      doc.y = y + 22;
    }

    if (lines.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#555')
        .text('Aucun écart : le comptage correspond au stock attendu.', MARGE, doc.y + 10);
      doc.fillColor('#000');
    } else {
      doc.moveDown(0.4);
      trait(doc);
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10)
        .text(`Valeur totale des écarts : ${eur(Number(totalValeur.toFixed(2)))}`,
          MARGE, doc.y, { width: doc.page.width - 2 * MARGE, align: 'right' });
    }

    doc.end();
  });
}

function trait(doc: PDFKit.PDFDocument) {
  doc.moveTo(MARGE, doc.y).lineTo(doc.page.width - MARGE, doc.y)
    .lineWidth(0.5).strokeColor('#CCC').stroke().strokeColor('#000');
}
