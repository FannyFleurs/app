import { type LabelSettings } from '@/lib/settings/label';
import { type LabelProduct } from '@/lib/services/label-print';
import { renderSingleLabelBitmap, renderTestLabelBitmap } from '@/lib/services/cloudprnt/label-render';
import { buildLabelsMarkup, buildTestLabelsMarkup } from '@/lib/services/cloudprnt/markup';
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
 * Fin d'étiquette : coupe et repositionnement sur le support suivant.
 *
 * TODO — remplacer `enc.cut()` par la séquence StarPRNT officielle de coupe
 * AVEC avance (équivalent fonctionnel de FullCutWithFeed), à injecter via
 * `enc.raw([...])`. `enc.cut()` émet aujourd'hui `1B 64 00` (ESC d 0), une
 * coupe sèche : rien ne garantit que le support se recale sur la marque noire
 * avant l'étiquette suivante.
 *
 * Ne JAMAIS remplacer cela par une avance fixe (feed de 25 mm, répétition de
 * LF, `newline()` calculé) : ce serait refabriquer le pas en logiciel, donc
 * réintroduire la dérive cumulative que toute cette architecture élimine.
 */
function appendLabelCut(enc: { cut: () => void }): void {
  enc.cut();
}

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
 * Job d'un lot d'étiquettes.
 *
 * Chemin nominal : un document Star Document Markup — une image par
 * étiquette, `[feed: black-mark]` entre deux, une seule `[cut]` à la fin —
 * converti en StarPRNT par CPUtil. Le recalage entre deux étiquettes est fait
 * par le capteur de marque noire, jamais par une avance calculée ici.
 *
 * Repli : tant que le binaire CPUtil n'est pas déposé dans `bin/cputil/`, on
 * encode directement (une image, une coupe, par étiquette). Ce repli imprime,
 * mais sans le recalage sur la marque — il n'est là que pour ne pas arrêter la
 * boutique, et il le dit dans les journaux.
 */
export async function buildLabelsStarPrnt(
  entries: Array<{ product: LabelProduct; qty: number }>,
  settings: LabelSettings,
): Promise<Buffer> {
  const media = mediaImprimable(settings);
  const flat = aplatir(entries);
  if (flat.length === 0) throw new Error('Aucune étiquette à imprimer.');

  if (await cputilDisponible()) {
    const markup = await buildLabelsMarkup(flat, media);
    const out = await convertMarkupToStarPrnt(markup, PRINT_AREA_DOTS);
    traceJob(flat.length, markup.length, out.length, 'markup+cputil');
    return out;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[label-job] CPUtil absent (${cputilPath()}) : repli sur l'encodage direct, `
    + 'sans recalage sur la marque noire entre deux étiquettes.',
  );
  return encoderDirect(flat, media);
}

/** Repli : une image, une coupe, par étiquette, sans passer par le Markup. */
async function encoderDirect(
  flat: LabelProduct[], media: LabelSettings,
): Promise<Buffer> {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;

  const enc = new StarPrntEncoder({});
  enc.initialize();

  for (const product of flat) {
    const bmp = await renderSingleLabelBitmap(product, media);
    enc.image(
      { data: bmp.data, width: bmp.width, height: bmp.height },
      bmp.width,
      bmp.height,
      'threshold',
    );
    appendLabelCut(enc);
  }

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

  if (await cputilDisponible()) {
    const markup = await buildTestLabelsMarkup(n, media);
    const out = await convertMarkupToStarPrnt(markup, PRINT_AREA_DOTS);
    traceJob(n, markup.length, out.length, 'markup+cputil');
    return out;
  }

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
    appendLabelCut(enc);
  }

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
