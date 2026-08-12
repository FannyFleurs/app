import { describe, it, expect, vi } from 'vitest';
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
 *
 * Ces tests fabriquent de VRAIS jobs : ils rendent les bitmaps et lancent
 * CPUtil en sous-processus. Seuls, ils tiennent en 2,5 s ; lancés en parallèle
 * du reste de la suite, plusieurs CPUtil se disputent le processeur et les 5 s
 * par défaut de Vitest sont dépassées de temps en temps. Le délai est donc
 * relevé pour ce fichier : l'échec n'apprenait rien, il fallait relancer.
 */
vi.setConfig({ testTimeout: 30_000 });

const PRODUIT = {
  name: 'Begonia blad. Double', sku: null,
  barcode: '3352608720039', sale_price_ttc: 27.3,
};
const REGLAGES = { ...LABEL_DEFAULTS, width_mm: 50, height_mm: 25 };

/**
 * Coupe StarPRNT : `1B 64 00`, coupe SÈCHE.
 *
 * `1B 64 03` (coupe avec sa petite avance mécanique) tombait au milieu de
 * l'étiquette : c'est l'avance sur la marque qui amène le papier au bord.
 */
const COUPE = /1b6400/g;

/**
 * Avance sur la marque noire dans le flux binaire.
 *
 * On ne peut pas compter les `0x0C` isolés : les données raster en
 * contiennent par hasard. On ne retient que ceux suivis d'une commande —
 * directement (CPUtil pose l'octet nu) ou après le LF/CR dont l'encodeur de
 * repli entoure `raw()`.
 */
const avances = (job: Buffer) =>
  (job.toString('hex').match(/0c(1b|0a0d1b)/g) ?? []).length;

describe('Un job, N étiquettes indépendantes', () => {
  it('émet UNE coupe et N avances sur la marque', async () => {
    // Structure validée sur l'imprimante : imprimer, chercher la marque
    // suivante, … y compris après la DERNIÈRE image — sans quoi la coupe
    // tombe au milieu de l'étiquette. Et rien avant la première : l'imprimante
    // est déjà positionnée, une avance en tête sortait une vierge.
    for (const n of [1, 2, 3, 10]) {
      const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: n }], REGLAGES);
      const coupes = (job.toString('hex').match(COUPE) ?? []).length;
      expect(coupes, `${n} étiquette(s)`).toBe(1);
      expect(avances(job), `${n} étiquette(s)`).toBe(n);
    }
  });

  it('ne place aucune avance avant la première image', async () => {
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 3 }], REGLAGES);
    const premierRaster = job.indexOf(Buffer.from([0x1b, 0x1d, 0x53]));
    const debut = job.subarray(0, premierRaster >= 0 ? premierRaster : 64);
    expect(debut.includes(0x0c)).toBe(false);
  });

  it('n\'initialise qu\'une fois, quel que soit le lot', async () => {
    // Un seul job CloudPRNT : une initialisation, N cycles, un encode.
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 5 }], REGLAGES);
    expect((job.toString('hex').match(/1b40/g) ?? []).length).toBe(1);
  });

  it('espace les avances d\'une étiquette entière', async () => {
    // Deux avances collées trahiraient une image unique suivie de feeds.
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 3 }], REGLAGES);
    const hex = job.toString('hex');
    // Les deux premières avances précèdent un raster, la dernière la coupe :
    // on cherche donc « 0C suivi d'une commande », quelle qu'elle soit.
    const positions: number[] = [];
    for (let i = 0; i + 4 <= hex.length; i += 2) {
      if (/^0c1b/.test(hex.slice(i, i + 4))) positions.push(i / 2);
    }
    // Trois images : trois avances, dont la dernière juste avant la coupe.
    expect(positions).toHaveLength(3);
    const ecart = positions[1]! - positions[0]!;
    expect(ecart).toBeGreaterThan(job.length * 0.25);
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

  it('nomme l\'octet d\'avance et ne l\'écrit qu\'à un endroit', () => {
    // 0x0C = form feed. Sur une imprimante réglée « Top Search Sensor =
    // Black Mark », il avance jusqu'à la marque : c'est le capteur qui donne
    // la distance. Trouvé en compilant [feed: black-mark] avec CPUtil.
    expect(src).toMatch(/const FEED_BLACK_MARK = 0x0c;/);
    expect(src).toMatch(/enc\.raw\(\[FEED_BLACK_MARK\]\)/);
  });

  it('borne la quantité sans découper le rendu en tranches', async () => {
    expect(MAX_LABELS_PER_JOB).toBe(200);
    // La borne s'applique au lot aplati, pas à un découpage graphique : au-delà
    // on tronque, on ne segmente pas.
    const job = await buildLabelsStarPrnt([{ product: PRODUIT, qty: 4 }], REGLAGES);
    expect(avances(job)).toBe(4);
    expect((job.toString('hex').match(COUPE) ?? []).length).toBe(1);
  });
});

describe('Lot de réglage', () => {
  it('numérote les étiquettes et n\'imprime aucun code-barres', async () => {
    const job = await buildTestLabelsStarPrnt(3, REGLAGES);
    expect((job.toString('hex').match(COUPE) ?? []).length).toBe(1);
    expect(avances(job)).toBe(3);
    // Le rendu de test trace deux filets et un texte centré, rien d'autre.
    const rendu = readFileSync('lib/services/cloudprnt/label-render.ts', 'utf8');
    expect(rendu).toMatch(/export async function renderTestLabelBitmap/);
    expect(rendu).not.toMatch(/renderTestLabelBitmap[\s\S]{0,900}drawBarcode/);
  });
});

describe('Star Document Markup', () => {
  const MEDIA = { ...LABEL_DEFAULTS, width_mm: 50, height_mm: PRINTABLE_HEIGHT_MM };

  it('place une avance après CHAQUE image, la dernière comprise', async () => {
    const markup = await buildLabelsMarkup([PRODUIT, PRODUIT, PRODUIT], MEDIA);
    const lignes = markup.split('\n');
    expect(lignes).toHaveLength(7);
    expect(lignes[0]).toMatch(/^\[image: url "data:image\/png;base64,/);
    expect(lignes[1]).toBe('[feed: black-mark]\\');
    expect(lignes[3]).toBe('[feed: black-mark]\\');
    expect(lignes[5]).toBe('[feed: black-mark]\\');
    expect(lignes[6]).toBe('[cut: nofeed; full]');
    expect((markup.match(/\[feed: black-mark\]/g) ?? [])).toHaveLength(3);
  });

  it('commence par l\'image, jamais par une avance', async () => {
    // Une avance en tête faisait sortir une étiquette vierge : l'imprimante
    // est déjà positionnée sur le premier support au début du job.
    const markup = await buildLabelsMarkup([PRODUIT], MEDIA);
    expect(markup.split('\n')[0]).toMatch(/^\[image:/);
    expect(markup.split('\n')).toHaveLength(3);
    expect((markup.match(/\[feed: black-mark\]/g) ?? [])).toHaveLength(1);
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
    expect((markup.match(/\[feed: black-mark\]/g) ?? [])).toHaveLength(5);
    expect((markup.match(/\[cut: nofeed; full\]/g) ?? [])).toHaveLength(1);
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
