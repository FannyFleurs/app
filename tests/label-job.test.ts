import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildLabelsStarPrnt, buildTestLabelsStarPrnt,
  LABEL_PITCH_MM, PRINTABLE_HEIGHT_MM, MAX_LABELS_PER_JOB,
} from '@/lib/services/cloudprnt/starprnt';
import { renderSingleLabelBitmap, bitmapToPngBuffer } from '@/lib/services/cloudprnt/label-render';
import { buildLabelsMarkup, buildTestLabelsMarkup } from '@/lib/services/cloudprnt/markup';
import { LABEL_DEFAULTS } from '@/lib/settings/label';

/**
 * Architecture du job d'étiquettes.
 *
 *   1 étiquette logique = 1 bitmap indépendant = 1 cycle impression/coupe.
 *
 * Le logiciel empilait le lot dans une image continue, à un pas qu'il
 * fabriquait lui-même : l'écart entre ce pas et le support s'additionnait
 * d'une étiquette à l'autre, visible dès la troisième. Ces tests interdisent
 * le retour de cette architecture — le positionnement appartient au capteur
 * de marque noire de l'imprimante.
 */

const PRODUIT = {
  name: 'Begonia blad. Double', sku: null,
  barcode: '3352608720039', sale_price_ttc: 27.3,
};
const REGLAGES = { ...LABEL_DEFAULTS, width_mm: 50, height_mm: 25 };

/** Coupe StarPRNT émise par la bibliothèque : ESC d 0. */
const COUPE = /1b6400/g;

describe('Un job, N étiquettes indépendantes', () => {
  it('émet autant de coupes que d\'étiquettes', async () => {
    for (const n of [1, 2, 3, 10]) {
      const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: n }], REGLAGES);
      const hex = job.toString('hex');
      expect((hex.match(COUPE) ?? []).length, `${n} étiquette(s)`).toBe(n);
    }
  });

  it('n\'initialise qu\'une fois, quel que soit le lot', async () => {
    // Un seul job CloudPRNT : une initialisation, N cycles, un encode.
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 5 }], REGLAGES);
    expect((job.toString('hex').match(/1b40/g) ?? []).length).toBe(1);
  });

  it('répartit les coupes régulièrement — pas de tout imprimer puis couper', async () => {
    // Trois coupes groupées en fin de job trahiraient une image unique.
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 3 }], REGLAGES);
    const hex = job.toString('hex');
    const positions: number[] = [];
    for (let i = 0; i + 6 <= hex.length; i += 2) {
      if (hex.startsWith('1b6400', i)) positions.push(i / 2);
    }
    expect(positions).toHaveLength(3);
    const p1 = positions[1]! - positions[0]!;
    const p2 = positions[2]! - positions[1]!;
    // Les cycles sont identiques : même image, même écart d'une coupe à l'autre.
    expect(Math.abs(p1 - p2)).toBeLessThanOrEqual(2);
    // Et la première coupe tombe au premier tiers, pas à la fin.
    expect(positions[0]!).toBeLessThan(job.length / 2);
  });

  it('grandit proportionnellement à la quantité', async () => {
    const un = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 1 }], REGLAGES);
    const trois = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 3 }], REGLAGES);
    // Trois cycles identiques : trois fois la taille, à l'en-tête près.
    expect(trois.length).toBeGreaterThan(un.length * 2.9);
    expect(trois.length).toBeLessThan(un.length * 3.1);
  });
});

describe('Hauteur imprimée et pas du support', () => {
  it('imprime moins haut que le pas, marge de sécurité comprise', () => {
    // Star demande au moins 6 % du pas libre avant la marque suivante, sans
    // quoi la marque n'est pas détectée et une étiquette est sautée.
    expect(LABEL_PITCH_MM).toBe(25);
    expect(PRINTABLE_HEIGHT_MM).toBeLessThanOrEqual(LABEL_PITCH_MM - LABEL_PITCH_MM * 0.06);
    // Et la marque (5 mm, au dos) ne se retranche pas du pas.
    expect(PRINTABLE_HEIGHT_MM).toBeGreaterThan(LABEL_PITCH_MM - 5);
  });

  it('rend un bitmap à la hauteur imprimable, pas au pas', async () => {
    const bmp = await renderSingleLabelBitmap(PRODUIT, { ...REGLAGES, height_mm: PRINTABLE_HEIGHT_MM });
    expect(bmp.height / 8).toBe(PRINTABLE_HEIGHT_MM);
    expect(bmp.width / 8).toBe(50);
  });
});

describe('Ce qui ne doit plus exister', () => {
  const src = readFileSync('lib/services/cloudprnt/starprnt.ts', 'utf8');
  const rendu = readFileSync('lib/services/cloudprnt/label-render.ts', 'utf8');

  it('aucun pas fabriqué en logiciel', () => {
    for (const interdit of ['GAP_MM', 'MAX_PER_SHEET', 'renderLabelSheetBitmap', 'pitch']) {
      expect(rendu, interdit).not.toContain(interdit);
      expect(src, interdit).not.toContain(interdit);
    }
  });

  it('aucune avance fixe entre deux étiquettes', () => {
    // Un feed calculé pour « faire 25 mm » réintroduirait la dérive. On
    // cherche l'APPEL, pas la mention : le commentaire du code l'interdit
    // justement en toutes lettres.
    expect(src).not.toMatch(/enc\.(newline|feed|line|rule)\(/);
  });

  it('garde la coupe derrière une fonction dédiée', () => {
    // Le jour où la séquence de coupe AVEC avance sera connue, un seul
    // endroit changera.
    expect(src).toMatch(/function appendLabelCut/);
    expect(src).toContain('FullCutWithFeed');
    expect(src).toContain('enc.raw');
  });

  it('borne la quantité sans découper le rendu en tranches', () => {
    expect(MAX_LABELS_PER_JOB).toBe(200);
    const long = buildLabelsStarPrnt([{ product: PRODUIT, qty: 500 }], REGLAGES);
    return expect(long).resolves.toBeInstanceOf(Buffer);
  });
});

describe('Lot de réglage', () => {
  it('numérote les étiquettes et n\'imprime aucun code-barres', async () => {
    const job = await buildTestLabelsStarPrnt(3, REGLAGES);
    expect((job.toString('hex').match(COUPE) ?? []).length).toBe(3);
    // Le rendu de test trace deux filets et un texte centré, rien d'autre.
    const rendu = readFileSync('lib/services/cloudprnt/label-render.ts', 'utf8');
    expect(rendu).toMatch(/export async function renderTestLabelBitmap/);
    expect(rendu).not.toMatch(/renderTestLabelBitmap[\s\S]{0,900}drawBarcode/);
  });
});

describe('Star Document Markup', () => {
  const MEDIA = { ...LABEL_DEFAULTS, width_mm: 50, height_mm: PRINTABLE_HEIGHT_MM };

  it('intercale le recalage marque noire ENTRE les étiquettes seulement', async () => {
    // Un feed après la dernière image ferait avancer deux fois avant la coupe.
    const markup = await buildLabelsMarkup([PRODUIT, PRODUIT, PRODUIT], MEDIA);
    const lignes = markup.split('\n');
    expect(lignes).toHaveLength(6);
    expect(lignes[0]).toMatch(/^\[image: url "data:image\/png;base64,/);
    expect(lignes[1]).toBe('[feed: black-mark]\\');
    expect(lignes[3]).toBe('[feed: black-mark]\\');
    expect(lignes[5]).toBe('[cut]');
    expect((markup.match(/\[feed: black-mark\]/g) ?? [])).toHaveLength(2);
    expect((markup.match(/\[cut\]/g) ?? [])).toHaveLength(1);
  });

  it('n\'insère aucun feed pour une étiquette seule', async () => {
    const markup = await buildLabelsMarkup([PRODUIT], MEDIA);
    expect(markup).not.toContain('[feed:');
    expect(markup.split('\n')).toHaveLength(2);
  });

  it('protège la Data URL par des guillemets', async () => {
    // Sans guillemets, le « ; » de « image/png;base64 » serait lu comme un
    // séparateur de paramètres et le document deviendrait invalide.
    const markup = await buildLabelsMarkup([PRODUIT], MEDIA);
    expect(markup).toMatch(/\[image: url "data:image\/png;base64,[A-Za-z0-9+/=]+"\]\\$/m);
  });

  it('échappe le saut de ligne qui suit chaque image', async () => {
    // Sans le « \ » final, chaque étiquette gagnerait une ligne blanche.
    const markup = await buildLabelsMarkup([PRODUIT, PRODUIT], MEDIA);
    for (const l of markup.split('\n').filter((x) => x.startsWith('[image:'))) {
      expect(l.endsWith('\\')).toBe(true);
    }
  });

  it('produit un vrai PNG par étiquette', async () => {
    const bmp = await renderSingleLabelBitmap(PRODUIT, MEDIA);
    const png = await bitmapToPngBuffer(bmp);
    // Signature PNG : 89 50 4E 47.
    expect(png.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(png.length).toBeGreaterThan(500);
  });

  it('numérote le lot de réglage sans code-barres', async () => {
    const markup = await buildTestLabelsMarkup(5, MEDIA);
    expect((markup.match(/\[image:/g) ?? [])).toHaveLength(5);
    expect((markup.match(/\[feed: black-mark\]/g) ?? [])).toHaveLength(4);
    expect((markup.match(/\[cut\]/g) ?? [])).toHaveLength(1);
  });
});

describe('Conversion CPUtil', () => {
  const src = readFileSync('lib/services/cloudprnt/cputil.ts', 'utf8');

  it('appelle CPUtil avec la syntaxe documentée', () => {
    // cputil [options] decode <type MIME> <entrée> <sortie>, « - » = stdout.
    expect(src).toMatch(/'printarea', String\(printAreaDots\), 'decode', 'application\/vnd\.star\.starprnt'/);
    expect(src).toMatch(/entree, '-'/);
  });

  it('n\'écrit que le .stm sur disque, dans /tmp', () => {
    // Seul répertoire inscriptible d'une lambda ; les PNG restent en mémoire.
    expect(src).toMatch(/os\.tmpdir\(\)/);
    expect(src).toMatch(/\.stm/);
    expect(src).toMatch(/unlink\(entree\)/);
  });

  it('dit clairement pourquoi il échoue, et journalise stderr', () => {
    expect(src).toContain('CputilError');
    expect(src).toMatch(/buffer vide/);
    expect(src).toMatch(/console\.error\('\[cputil\] échec'/);
  });
});
