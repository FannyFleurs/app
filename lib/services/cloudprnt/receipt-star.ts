/**
 * Jobs StarPRNT pour l'imprimante TICKET (Star CloudPRNT, ex. TSP143 / mC-Print).
 *   - buildDrawerKickStarPrnt : ouvre le tiroir-caisse branché sur l'imprimante
 *     (impulsion « drawer kick »), sans rien imprimer.
 *   - buildTestReceiptStarPrnt : court ticket de test + ouverture tiroir + coupe,
 *     pour valider la configuration.
 */

export const STARPRNT_CONTENT_TYPE = 'application/vnd.star.starprnt';

async function newEncoder() {
  const mod = await import('star-prnt-encoder');
  const StarPrntEncoder = mod.default;
  const enc = new StarPrntEncoder({});
  enc.initialize();
  // `pulse()` (impulsion tiroir) existe à l'exécution mais manque aux typings.
  return enc as typeof enc & { pulse: () => void };
}

/** Impulsion d'ouverture du tiroir-caisse (aucune impression). */
export async function buildDrawerKickStarPrnt(): Promise<Buffer> {
  const enc = await newEncoder();
  enc.pulse();
  return Buffer.from(enc.encode());
}

/** Ticket de test : en-tête boutique, date, puis ouverture tiroir + coupe. */
export async function buildTestReceiptStarPrnt(shopName?: string | null): Promise<Buffer> {
  const enc = await newEncoder();
  enc.align('center');
  enc.line(shopName?.trim() || 'HelloPos');
  enc.line('— TEST IMPRESSION —');
  enc.newline();
  enc.align('left');
  enc.line(new Date().toLocaleString('fr-FR'));
  enc.line('Imprimante ticket CloudPRNT : OK');
  enc.line('Ouverture du tiroir-caisse...');
  enc.newline();
  enc.pulse(); // ouvre le tiroir en même temps que le ticket sort
  enc.cut();
  return Buffer.from(enc.encode());
}
