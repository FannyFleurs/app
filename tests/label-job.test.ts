import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildLabelsStarPrnt, buildTestLabelsStarPrnt,
  LABEL_PITCH_MM, PRINTABLE_HEIGHT_MM, MAX_LABELS_PER_JOB,
} from '@/lib/services/cloudprnt/starprnt';
import { renderSingleLabelBitmap } from '@/lib/services/cloudprnt/label-render';
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
