import { describe, it, expect } from 'vitest';
import { computeLabelLayout, estimateWidthMm } from '@/lib/services/label-layout';
import { LABEL_DEFAULTS, LABEL_SIZE_PRESETS, mergeLabelDefaults, type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print-core';

/**
 * Mise en page des étiquettes.
 *
 * Ces tests reprennent un à un les défauts constatés sur les étiquettes
 * imprimées : nom absent du haut, nom long tronqué au lieu de passer à la
 * ligne, rendu minuscule dès qu'on change de format, contenu qui déborde des
 * bords. Ils portent sur le moteur, seul endroit où ces décisions sont prises,
 * et valent donc pour les trois rendus qui le consomment.
 */

const SHORT: LabelProduct = {
  name: 'Rose', sku: '231/13', barcode: '4002477692883', sale_price_ttc: 6.9,
};
const LONG: LabelProduct = {
  name: 'Cache-pot en céramique émaillée blanc cassé grand modèle',
  sku: '231/13', barcode: '4002477692883', sale_price_ttc: 6.9,
};

const settings = (over: Partial<LabelSettings> = {}): LabelSettings => ({
  ...LABEL_DEFAULTS, layout: { ...LABEL_DEFAULTS.layout }, ...over,
});

/** Bas du bloc, marge de sécurité comprise. */
const bottom = (b: { yMm: number; hMm: number }) => b.yMm + b.hMm;

describe('Composition', () => {
  it("place le nom tout en haut, avant le prix et le code-barres", () => {
    const { blocks } = computeLabelLayout(LONG, settings({ show_sku: true }));
    const order = blocks.map((b) => b.kind);
    expect(order[0]).toBe('name');
    expect(order.indexOf('name')).toBeLessThan(order.indexOf('price'));
    expect(order.indexOf('price')).toBeLessThan(order.indexOf('barcode'));

    const name = blocks.find((b) => b.kind === 'name')!;
    const { marginMm } = computeLabelLayout(LONG, settings());
    // « En haut » veut dire contre la marge, pas « quelque part au-dessus ».
    expect(name.yMm).toBeCloseTo(marginMm, 5);
  });

  it('rend sa place aux autres quand un élément est masqué', () => {
    const avec = computeLabelLayout(SHORT, settings({ show_barcode: true }));
    const sans = computeLabelLayout(SHORT, settings({ show_barcode: false }));
    const p1 = avec.blocks.find((b) => b.kind === 'price')!;
    const p2 = sans.blocks.find((b) => b.kind === 'price')!;
    // Sans code-barres, le prix récupère de la hauteur et grossit.
    expect(p2.fontMm).toBeGreaterThan(p1.fontMm);
    expect(sans.blocks.some((b) => b.kind === 'barcode')).toBe(false);
  });
});

describe('Nom long', () => {
  it('passe à la ligne au lieu d\'être tronqué', () => {
    const { blocks } = computeLabelLayout(LONG, settings());
    const name = blocks.find((b) => b.kind === 'name')!;
    expect(name.lines.length).toBeGreaterThan(1);
    // Le nom complet est restitué, sans marque de troncature.
    expect(name.lines.join(' ')).toBe(LONG.name);
    expect(name.lines.join('')).not.toContain('…');
  });

  it('coupe un mot unique plus large que l\'étiquette', () => {
    const p = { ...SHORT, name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJ' };
    const { blocks, widthMm, marginMm } = computeLabelLayout(p, settings());
    const name = blocks.find((b) => b.kind === 'name')!;
    const usable = widthMm - marginMm * 2;
    for (const line of name.lines) {
      expect(estimateWidthMm(line, name.fontMm, true)).toBeLessThanOrEqual(usable + 0.01);
    }
  });

  it('garde une seule ligne pour un nom court', () => {
    const { blocks } = computeLabelLayout(SHORT, settings());
    expect(blocks.find((b) => b.kind === 'name')!.lines).toEqual(['Rose']);
  });
});

describe('Adaptation au format', () => {
  // Le grief d'origine : changer de format imprimait « tout en microscopique ».
  it('grandit avec l\'étiquette, sans jamais devenir illisible', () => {
    const petite = computeLabelLayout(SHORT, settings({ width_mm: 32, height_mm: 25 }));
    const grande = computeLabelLayout(SHORT, settings({ width_mm: 57, height_mm: 32 }));
    const prix = (r: typeof petite) => r.blocks.find((b) => b.kind === 'price')!.fontMm;

    expect(prix(grande)).toBeGreaterThan(prix(petite));
    // Sur la plus petite étiquette du catalogue, le prix reste substantiel :
    // au moins un cinquième de la hauteur.
    expect(prix(petite)).toBeGreaterThan(25 * 0.2);
  });

  it('occupe une part comparable de la hauteur quel que soit le format', () => {
    const parts = LABEL_SIZE_PRESETS.map((f) => {
      const r = computeLabelLayout(SHORT, settings({ width_mm: f.w, height_mm: f.h }));
      return r.blocks.find((b) => b.kind === 'price')!.fontMm / f.h;
    });
    // Le rapport prix/hauteur ne varie pas du simple au double d'un format à
    // l'autre : c'est la définition pratique de « responsive » ici.
    expect(Math.max(...parts) / Math.min(...parts)).toBeLessThan(1.6);
  });
});

describe('Tenue dans les bords', () => {
  const PRODUITS = [SHORT, LONG, { ...LONG, name: 'A' }, { ...SHORT, barcode: null }];

  it('garde tout le contenu à l\'intérieur des marges, pour tous les formats', () => {
    for (const f of LABEL_SIZE_PRESETS) {
      for (const p of PRODUITS) {
        for (const sku of [false, true]) {
          const r = computeLabelLayout(p, settings({ width_mm: f.w, height_mm: f.h, show_sku: sku }));
          for (const b of r.blocks) {
            const nom = `${f.w}×${f.h} ${b.kind}`;
            expect.soft(b.xMm, nom).toBeGreaterThanOrEqual(r.marginMm - 0.01);
            expect.soft(b.xMm + b.wMm, nom).toBeLessThanOrEqual(r.widthMm - r.marginMm + 0.01);
            expect.soft(b.yMm, nom).toBeGreaterThanOrEqual(r.marginMm - 0.01);
            const bas = b.kind === 'barcode' ? bottom(b) + b.fontMm * 1.25 : bottom(b);
            expect.soft(bas, nom).toBeLessThanOrEqual(r.heightMm - r.marginBottomMm + 0.01);
          }
        }
      }
    }
  });

  it('réserve une marge de sécurité, plus large en bas', () => {
    for (const f of LABEL_SIZE_PRESETS) {
      const r = computeLabelLayout(LONG, settings({ width_mm: f.w, height_mm: f.h }));
      // Marges volontairement serrées : sur 25 mm de haut, chaque dixième
      // rendu au contenu grossit le code-barres. Le bord d'attaque ne risque
      // rien (l'étiquette entre déjà calée sous la tête), le bord de fuite
      // garde donc la marge la plus large des deux.
      expect(r.marginMm).toBeGreaterThanOrEqual(0.8);
      expect(r.marginBottomMm).toBeGreaterThanOrEqual(1.5);
      expect(r.marginBottomMm).toBeGreaterThan(r.marginMm);
    }
  });

  it('éloigne les chiffres du code-barres du bord de fuite', () => {
    for (const f of LABEL_SIZE_PRESETS) {
      const r = computeLabelLayout(SHORT, settings({ width_mm: f.w, height_mm: f.h }));
      const bc = r.blocks.find((b) => b.kind === 'barcode')!;
      const basChiffres = bc.yMm + bc.hMm + bc.fontMm * 1.25;
      // Au moins 1,5 mm sous le dernier trait d'encre. C'était 3 mm tant que
      // la position de l'étiquette se devinait : sur papier à marque noire,
      // elle se lit sur la marque et la dérive ne se cumule plus.
      expect.soft(f.h - basChiffres, `${f.w}×${f.h}`).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('n\'empile jamais deux blocs l\'un sur l\'autre', () => {
    // Balaie les combinaisons, dont « nom long + remise » : c'est celle qui
    // faisait chevaucher le nom et l'ancien prix dans l'aperçu.
    const remisé: LabelProduct = { ...LONG, discount_type: 'percent', discount_value: 10 };
    for (const f of LABEL_SIZE_PRESETS) {
      for (const p of [SHORT, LONG, remisé]) {
        for (const sku of [false, true]) {
          const r = computeLabelLayout(p, settings({ width_mm: f.w, height_mm: f.h, show_sku: sku }));
          const tries = [...r.blocks].sort((a, b) => a.yMm - b.yMm);
          for (let i = 1; i < tries.length; i++) {
            const prec = tries[i - 1]!;
            const hautPrec = prec.kind === 'barcode' ? bottom(prec) + prec.fontMm * 1.25 : bottom(prec);
            expect.soft(tries[i]!.yMm, `${f.w}×${f.h} ${prec.kind}→${tries[i]!.kind}`)
              .toBeGreaterThanOrEqual(hautPrec - 0.01);
          }
        }
      }
    }
  });
});

describe('Prix remisé', () => {
  it('affiche l\'ancien prix barré au-dessus du nouveau', () => {
    const p: LabelProduct = { ...SHORT, discount_type: 'percent', discount_value: 20 };
    const { blocks } = computeLabelLayout(p, settings());
    const ancien = blocks.find((b) => b.kind === 'price-old')!;
    const nouveau = blocks.find((b) => b.kind === 'price')!;
    expect(ancien.strike).toBe(true);
    expect(ancien.yMm).toBeLessThan(nouveau.yMm);
    expect(ancien.lines[0]).toContain('6,90');
    expect(nouveau.lines[0]).toContain('5,52');
    // Le prix affiché reste celui qui compte : le plus gros des deux.
    expect(nouveau.fontMm).toBeGreaterThan(ancien.fontMm);
  });

  it('ignore la remise quand le réglage la masque', () => {
    const p: LabelProduct = { ...SHORT, discount_type: 'percent', discount_value: 20 };
    const { blocks } = computeLabelLayout(p, settings({ show_discount: false }));
    expect(blocks.some((b) => b.kind === 'price-old')).toBe(false);
    expect(blocks.find((b) => b.kind === 'price')!.lines[0]).toContain('6,90');
  });
});

describe('Calage de l\'imprimante', () => {
  it("ne s'applique pas tant que l'appelant ne le demande pas", () => {
    // L'aperçu appelle le moteur SANS calage : il montre la mise en page cible,
    // pas la correction appliquée à la machine. Seul le rendu thermique la
    // passe en argument.
    const sans = computeLabelLayout(SHORT, settings({ print_offset_y_mm: -5 }));
    const neutre = computeLabelLayout(SHORT, settings({ print_offset_y_mm: 0 }));
    expect(sans.blocks.map((b) => b.yMm)).toEqual(neutre.blocks.map((b) => b.yMm));
  });

  it('remonte le contenu sans jamais le faire sortir de l\'étiquette', () => {
    const neutre = computeLabelLayout(SHORT, settings({ width_mm: 50, height_mm: 50 }));
    const remonte = computeLabelLayout(SHORT, settings({ width_mm: 50, height_mm: 50 }), -5);

    // Le contenu se tasse vers le haut…
    expect(remonte.marginMm).toBeLessThan(neutre.marginMm);
    expect(remonte.marginBottomMm).toBeGreaterThan(neutre.marginBottomMm);
    // …sans jamais franchir le bord : une translation, elle, aurait rogné.
    for (const b of remonte.blocks) {
      expect.soft(b.yMm).toBeGreaterThanOrEqual(0);
      const bas = b.yMm + b.hMm + (b.kind === 'barcode' ? b.fontMm * 1.25 : 0);
      expect.soft(bas).toBeLessThanOrEqual(50);
    }
    // Le dernier trait d'encre remonte bien d'à peu près la valeur demandée.
    const dernier = (r: typeof neutre) => Math.max(...r.blocks.map(
      (b) => b.yMm + b.hMm + (b.kind === 'barcode' ? b.fontMm * 1.25 : 0)));
    expect(dernier(neutre) - dernier(remonte)).toBeGreaterThan(3.5);
  });

  it('borne le calage à une valeur qui reste une compensation', () => {
    expect(mergeLabelDefaults({ print_offset_y_mm: -80 }).print_offset_y_mm).toBe(-15);
    expect(mergeLabelDefaults({ print_offset_y_mm: 80 }).print_offset_y_mm).toBe(15);
    expect(mergeLabelDefaults({}).print_offset_y_mm).toBe(0);
    // Une valeur absente ou aberrante ne doit pas décaler l'impression.
    expect(mergeLabelDefaults({ print_offset_y_mm: NaN }).print_offset_y_mm).toBe(0);
  });
});

describe('Marge haute', () => {
  it('reste serrée pour laisser la place au contenu', () => {
    for (const f of LABEL_SIZE_PRESETS) {
      const r = computeLabelLayout(SHORT, settings({ width_mm: f.w, height_mm: f.h }));
      expect.soft(r.marginMm, `${f.w}×${f.h}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('Papier : écart et calage horizontal', () => {
  it('accepte un écart nul (papier à marque noire)', () => {
    // Sur ce papier, le pas EST la hauteur d'étiquette : 3 mm d'écart en dur
    // décalaient le lot de 3 mm de plus à chaque étiquette.
    expect(mergeLabelDefaults({ gap_mm: 0 }).gap_mm).toBe(0);
    expect(mergeLabelDefaults({ gap_mm: 1.5 }).gap_mm).toBe(1.5);
    // Valeur absente : on garde le rouleau prédécoupé d'origine.
    expect(mergeLabelDefaults({}).gap_mm).toBe(3);
    expect(mergeLabelDefaults({ gap_mm: -4 as unknown as number }).gap_mm).toBe(0);
  });

  it('donne au code-barres de quoi être accroché', () => {
    // Sur l'étiquette du rayon (50 × 25), les barres faisaient moins de 5 mm :
    // lisibles de face, capricieuses de travers. Le bloc pèse désormais plus
    // lourd que le prix dans le partage de la hauteur.
    const r = computeLabelLayout(SHORT, settings({ width_mm: 50, height_mm: 25 }));
    const bc = r.blocks.find((b) => b.kind === 'barcode')!;
    expect(bc.hMm).toBeGreaterThanOrEqual(6);
    expect(bc.fontMm).toBeGreaterThanOrEqual(2);
  });

  it('déplace le contenu sans le rogner', () => {
    // Le calage joue sur les MARGES : une translation pousserait le contenu
    // au-delà du bord, soit exactement le défaut qu'on corrige.
    const s = settings({ width_mm: 50, height_mm: 25 });
    const centre = computeLabelLayout(SHORT, s);
    const droite = computeLabelLayout(SHORT, s, 0, 2);
    const gauche = computeLabelLayout(SHORT, s, 0, -2);
    const x = (r: typeof centre) => r.blocks[0]!.xMm;
    expect(x(droite)).toBeGreaterThan(x(centre));
    expect(x(gauche)).toBeLessThan(x(centre));
    for (const r of [centre, droite, gauche]) {
      for (const b of r.blocks) {
        expect(b.xMm).toBeGreaterThanOrEqual(0);
        expect(b.xMm + b.wMm).toBeLessThanOrEqual(r.widthMm + 0.01);
      }
    }
  });

  it('borne le calage pour ne jamais sortir de l\'étiquette', () => {
    const s = settings({ width_mm: 50, height_mm: 25 });
    for (const shift of [-40, 40]) {
      const r = computeLabelLayout(LONG, s, 0, shift);
      for (const b of r.blocks) {
        expect(b.xMm).toBeGreaterThanOrEqual(0);
        expect(b.xMm + b.wMm).toBeLessThanOrEqual(r.widthMm + 0.01);
      }
    }
  });
});
