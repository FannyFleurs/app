import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import { renderSingleLabelBitmap, renderTestLabelBitmap } from '@/lib/services/cloudprnt/label-render';
import {
  buildLabelsMarkup, buildTestLabelsMarkup, buildComparatifMarkup,
} from '@/lib/services/cloudprnt/markup';
import { convertMarkupToStarPrnt, cputilDisponible, cputilPath } from '@/lib/services/cloudprnt/cputil';

/**
 * Job StarPRNT (`application/vnd.star.starprnt`) pour l'imprimante d'étiquettes
 * mC-Label3, sur média à MARQUE NOIRE.
 *
 * Principe, et il n'y en a qu'un :
 *
 *   1 étiquette logique = 1 bitmap indépendant = 1 cycle impression/coupe.
 *
 * Le logiciel ne fabrique plus le pas entre deux étiquettes. Il l'a fait
 * longtemps — un lot était empilé dans une seule image continue au pas
 * « hauteur + écart » — et c'était l'erreur : l'écart déclaré ne correspondait
 * jamais exactement au support, et la différence s'additionnait d'une
 * étiquette à l'autre, visible dès la troisième. Le positionnement physique
 * appartient au capteur de marque noire de l'imprimante, pas à nous.
 *
 * Un seul job CloudPRNT pour tout le lot : un `initialize()`, N fois
 * (`image()` + coupe), un `encode()`.
 *
 * Pourquoi image + StarPRNT : la mC-Label3 ne gère pas le Star Document Markup,
 * et le mode texte StarPRNT ne sait ni centrer le texte agrandi ni positionner
 * des blocs.
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

/**
 * Pas physique du support, marque noire à marque noire.
 *
 * Propriété du MÉDIA, pas du rendu : cette valeur n'entre dans aucun calcul de
 * bitmap. Elle est ici pour documenter le rouleau en service et pour situer la
 * hauteur imprimable ci-dessous. Changer de rouleau = changer ces deux
 * constantes, rien d'autre.
 */
export const LABEL_PITCH_MM = 25;

/**
 * Hauteur RÉELLEMENT encrée, marge de sécurité comprise.
 *
 * Star demande de laisser sous la zone imprimée au moins 6 % du pas avant la
 * marque suivante (soit 1,5 mm ici), faute de quoi la marque n'est pas
 * détectée et une étiquette est sautée. On imprime donc 23 mm sur un pas de
 * 25. La longueur de la marque (5 mm) ne se retranche PAS du pas : elle est au
 * dos, l'étiquette fait bien 25 mm.
 */
export const PRINTABLE_HEIGHT_MM = 23;

/** Garde-fou serveur : un lot au-delà n'est pas un usage, c'est un accident. */
export const MAX_LABELS_PER_JOB = 200;

/**
 * Avance jusqu'à la MARQUE NOIRE suivante : un seul octet, `0x0C` (FF).
 *
 * Trouvé en compilant `[feed: black-mark]` avec CPUtil et en comparant le
 * résultat au même document sans le feed : la différence tenait en un octet.
 * Les spécifications de commandes StarPRNT étant publiées en PDF chiffrés,
 * c'était le seul moyen de l'obtenir.
 *
 * Sur une imprimante réglée `Top Search Sensor = Black Mark` et `Top Search
 * Control = Enabled`, le form feed avance jusqu'à la prochaine marque : c'est
 * le capteur qui décide de la distance, pas nous. Ne JAMAIS remplacer cela par
 * une avance fixe (25 mm, répétition de LF, `newline()`) : ce serait
 * refabriquer le pas en logiciel, donc réintroduire la dérive cumulative.
 */
const FEED_BLACK_MARK = 0x0c;

/** Aplatit le lot (article × quantité), borné par MAX_LABELS_PER_JOB. */
function aplatir(entries: Array<{ product: LabelProduct; qty: number }>): LabelProduct[] {
  const flat: LabelProduct[] = [];
  for (const { product, qty } of entries) {
    const n = Math.max(1, Math.min(MAX_LABELS_PER_JOB, Math.round(qty || 0)));
    for (let i = 0; i < n; i++) {
      if (flat.length >= MAX_LABELS_PER_JOB) return flat;
      flat.push(product);
    }
  }
  return flat;
}

/**
 * Média d'impression : la largeur vient des réglages, la hauteur est la
 * hauteur imprimable — jamais le pas.
 */
function mediaImprimable(settings: LabelSettings): LabelSettings {
  return { ...settings, height_mm: PRINTABLE_HEIGHT_MM };
}

/**
 * Largeur de la zone d'impression, en points : 50 mm à 203 dpi.
 * Doit rester cohérente avec la largeur du bitmap rendu.
 */
const PRINT_AREA_DOTS = 400;

/** Trace de fabrication du job, sans jamais publier les Data URL. */
function traceJob(etiquettes: number, markupLen: number, octets: number, moteur: string): void {
  if (process.env.LABEL_JOB_HEXDUMP !== '1') return;
  // eslint-disable-next-line no-console
  console.log(`[label-job] ${moteur} · ${etiquettes} étiquette(s) · markup ${markupLen} car. · ${octets} octets`);
}

/**
 * Moteur ayant réellement produit le dernier job, et pourquoi.
 *
 * L'appelant le renvoie à l'écran : quand une impression part de travers, la
 * première question est « par quel chemin est-elle passée ». Sans cette
 * réponse, on diagnostique à l'aveugle — ce qui a déjà coûté trois essais.
 */
export interface MoteurJob { moteur: 'markup+cputil' | 'starprnt-encoder'; raison?: string }
let dernierMoteur: MoteurJob = { moteur: 'starprnt-encoder' };
export function dernierMoteurJob(): MoteurJob { return dernierMoteur; }

/**
 * Essaie le chemin Markup + CPUtil, et retombe sur l'encodage direct à la
 * MOINDRE difficulté — binaire absent, non exécutable, conversion en échec.
 *
 * Le repli produit la même structure (image, 0x0C, image, …, une coupe) :
 * l'impression reste juste. Ce qui compte, c'est que la boutique ne s'arrête
 * jamais sur un problème d'outil, et que la raison soit dite.
 */
async function viaCputil(markup: () => Promise<string>): Promise<Buffer | null> {
  if (!(await cputilDisponible())) {
    dernierMoteur = { moteur: 'starprnt-encoder', raison: `CPUtil absent : ${cputilPath()}` };
    // eslint-disable-next-line no-console
    console.warn(`[label-job] ${dernierMoteur.raison} — repli sur l'encodage direct.`);
    return null;
  }
  try {
    const doc = await markup();
    const out = await convertMarkupToStarPrnt(doc, PRINT_AREA_DOTS);
    dernierMoteur = { moteur: 'markup+cputil' };
    traceJob(0, doc.length, out.length, 'markup+cputil');
    return out;
  } catch (err) {
    const raison = (err as Error).message ?? 'erreur inconnue';
    dernierMoteur = { moteur: 'starprnt-encoder', raison: `CPUtil en échec : ${raison}` };
    // eslint-disable-next-line no-console
    console.error(`[label-job] ${dernierMoteur.raison} — repli sur l'encodage direct.`);
    return null;
  }
}

/**
 * Job d'un lot d'étiquettes.
 *
 * Chemin nominal : un document Star Document Markup — une image par
 * étiquette, `[feed: black-mark]` entre deux, une seule `[cut]` à la fin —
 * converti en StarPRNT par CPUtil. Le recalage entre deux étiquettes est fait
 * par le capteur de marque noire, jamais par une avance calculée ici.
 *
 * Repli si le binaire CPUtil manque : on encode nous-mêmes la même structure,
 * l'octet d'avance sur la marque étant désormais connu (0x0C). Le résultat est
 * équivalent ; le chemin Markup reste le nominal parce que c'est Star qui y
 * décide des commandes, pas nous.
 */
export async function buildLabelsStarPrnt(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): Promise<Buffer> {
  const media = mediaImprimable(settings);
  const flat = aplatir(entries);
  if (flat.length === 0) throw new Error('Aucune étiquette à imprimer.');

  const parCputil = await viaCputil(() => buildLabelsMarkup(flat, media));
  return parCputil ?? encoderDirect(flat, media);
}

/** Repli : une image, une coupe, par étiquette, sans passer par le Markup. */
async function encoderDirect(
  flat: LabelProduct[], media: LabelSettings,
): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;

  const enc = new StarPrntEncoder({});
  enc.initialize();

  // Même structure que le document Markup : image, avance sur la marque,
  // image, … et UNE seule coupe à la fin.
  //
  // Nuance connue de ce repli : la bibliothèque encadre `raw()` de LF/CR, si
  // bien que l'octet d'avance sort en « 0A 0D 0C 0A 0D ». Le saut de ligne qui
  // SUIT le form feed décale l'étiquette suivante d'une ligne. C'est pourquoi
  // le chemin nominal reste CPUtil, qui pose l'octet nu.
  for (let i = 0; i < flat.length; i++) {
    const bmp = await renderSingleLabelBitmap(flat[i]!, media);
    enc.image(
      { data: bmp.data, width: bmp.width, height: bmp.height },
      bmp.width,
      bmp.height,
      'threshold',
    );
    if (i < flat.length - 1) enc.raw([FEED_BLACK_MARK]);
  }
  enc.cut();

  const out = Buffer.from(enc.encode());
  traceJob(flat.length, 0, out.length, 'starprnt-encoder');
  return out;
}

/**
 * Lot de réglage : des étiquettes numérotées, filet en haut, filet en bas,
 * texte centré, aucun code-barres.
 *
 * On imprime 1, 2, 5, 10 puis 20 et on regarde une seule chose : la vingtième
 * doit tomber exactement comme la première. Un décalage CONSTANT se corrige
 * (calage vertical ou réglage machine) ; un décalage qui grandit d'étiquette
 * en étiquette signifie que le pas est encore fabriqué quelque part.
 */
export async function buildTestLabelsStarPrnt(
  count: number,
  settings: LabelSettings,
): Promise<Buffer> {
  const media = mediaImprimable(settings);
  const n = Math.max(1, Math.min(MAX_LABELS_PER_JOB, Math.round(count || 0)));

  const parCputil = await viaCputil(() => buildTestLabelsMarkup(n, media));
  if (parCputil) return parCputil;

  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  const enc = new StarPrntEncoder({});
  enc.initialize();

  for (let i = 1; i <= n; i++) {
    const bmp = await renderTestLabelBitmap(`TEST ${String(i).padStart(2, '0')}`, media);
    enc.image(
      { data: bmp.data, width: bmp.width, height: bmp.height },
      bmp.width,
      bmp.height,
      'threshold',
    );
    if (i < n) enc.raw([FEED_BLACK_MARK]);
  }
  enc.cut();

  const out = Buffer.from(enc.encode());
  traceJob(n, 0, out.length, 'starprnt-encoder');
  return out;
}

/** Nombre total d'étiquettes d'un lot (pour le libellé du job). */
export function countLabels(entries: Array<{ qty: number }>): number {
  return entries.reduce(
    (n, e) => n + Math.max(1, Math.min(MAX_LABELS_PER_JOB, Math.round(e.qty || 0))),
    0,
  );
}

/**
 * Comparatif des enchaînements : quatre façons d'enchaîner deux étiquettes,
 * marquées A à D, dans un seul tirage.
 *
 * Ce que le logiciel ne peut pas deviner, c'est la géométrie de la machine —
 * distance du capteur à la tête, de la tête au massicot. Elle décide de tout
 * et aucune documentation ne la donne. Une impression tranche ; quatre
 * hypothèses testées une par une coûtent quatre allers-retours au comptoir.
 *
 * Exige CPUtil : les enchaînements comparés sont des directives Markup.
 */
export async function buildComparatifStarPrnt(settings: LabelSettings): Promise<Buffer> {
  const media = mediaImprimable(settings);
  const parCputil = await viaCputil(() => buildComparatifMarkup(media));
  return parCputil ?? comparatifDirect(media);
}

/**
 * Le même comparatif, encodé sans CPUtil.
 *
 * Possible parce que les octets sont maintenant connus : `0x0C` pour l'avance
 * sur la marque, `1B 64 03` pour la coupe avec avance, `1B 64 00` pour la
 * coupe sèche. Le comparatif doit pouvoir être tiré même quand l'outil de
 * conversion fait défaut — c'est justement dans ces moments qu'on en a besoin.
 */
async function comparatifDirect(media: LabelSettings): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  const enc = new StarPrntEncoder({});
  enc.initialize();

  const COUPE_AVEC_AVANCE = [0x1b, 0x64, 0x03];
  const COUPE_SECHE = [0x1b, 0x64, 0x00];
  const modes: Array<{ cle: string; entre: number[]; fin: number[] }> = [
    { cle: 'A', entre: COUPE_AVEC_AVANCE,                        fin: COUPE_AVEC_AVANCE },
    { cle: 'B', entre: [FEED_BLACK_MARK, ...COUPE_SECHE],        fin: [FEED_BLACK_MARK, ...COUPE_SECHE] },
    { cle: 'C', entre: [FEED_BLACK_MARK],                        fin: COUPE_AVEC_AVANCE },
    { cle: 'D', entre: [],                                       fin: COUPE_AVEC_AVANCE },
  ];

  for (const mode of modes) {
    for (let i = 1; i <= 2; i++) {
      const bmp = await renderTestLabelBitmap(`${mode.cle}${i}`, media);
      enc.image(
        { data: bmp.data, width: bmp.width, height: bmp.height },
        bmp.width, bmp.height, 'threshold',
      );
      const suite = i < 2 ? mode.entre : mode.fin;
      if (suite.length > 0) enc.raw(suite);
    }
  }

  const out = Buffer.from(enc.encode());
  traceJob(8, 0, out.length, 'starprnt-encoder');
  return out;
}
