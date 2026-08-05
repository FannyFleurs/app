import { describe, it, expect } from 'vitest';
import {
  createScanBuffer, buildCodeIndex, normalizeCode, looksLikeCode, SEQUENCE_GAP_MS,
} from '@/app/pda/scan';

/**
 * Régression : « je scanne l'article A, puis l'article B, et c'est A qui
 * ressort ». Deux causes possibles, couvertes ici :
 *  - le tampon de frappes qui garde un reliquat du scan précédent ;
 *  - la résolution du code qui retombe sur un résultat de recherche périmé
 *    au lieu d'exiger une correspondance exacte.
 */

/** Joue un scan complet (frappes rapides + Entrée) et renvoie le code émis. */
function scan(buffer: ReturnType<typeof createScanBuffer>, code: string, startAt: number): string | null {
  let out: string | null = null;
  let t = startAt;
  for (const ch of code) {
    t += 15; // cadence d'une douchette
    const r = buffer.push(ch, t);
    if (r !== null) out = r;
  }
  const r = buffer.push('Enter', t + 15);
  return r ?? out;
}

describe('tampon de scan', () => {
  it('restitue le code scanné', () => {
    const b = createScanBuffer();
    expect(scan(b, '3401579847521', 1000)).toBe('3401579847521');
  });

  it('restitue des codes DIFFÉRENTS pour deux scans successifs', () => {
    const b = createScanBuffer();
    const a = scan(b, 'AAA111', 1000);
    const c = scan(b, 'BBB222', 1400);
    expect(a).toBe('AAA111');
    expect(c).toBe('BBB222');
  });

  it('ne laisse aucun reliquat entre deux scans', () => {
    const b = createScanBuffer();
    scan(b, 'AAA111', 1000);
    expect(b.peek()).toBe('');
  });

  it('démarre une nouvelle séquence après une longue pause', () => {
    const b = createScanBuffer();
    b.push('X', 1000);
    b.push('Y', 1000 + SEQUENCE_GAP_MS + 1);
    b.push('Z', 1000 + SEQUENCE_GAP_MS + 20);
    expect(b.push('Enter', 1000 + SEQUENCE_GAP_MS + 40)).toBe('YZ');
  });

  it('ignore une validation sans code (Entrée seule)', () => {
    const b = createScanBuffer();
    expect(b.push('Enter', 1000)).toBeNull();
  });

  it('gère la correction au clavier', () => {
    const b = createScanBuffer();
    b.push('1', 1000); b.push('2', 1010); b.push('9', 1020);
    b.push('Backspace', 1030);
    b.push('3', 1040);
    expect(b.push('Enter', 1050)).toBe('123');
  });

  it('ignore les touches de navigation', () => {
    const b = createScanBuffer();
    b.push('4', 1000);
    b.push('ArrowLeft', 1010);
    b.push('Shift', 1020);
    b.push('2', 1030);
    expect(b.push('Enter', 1040)).toBe('42');
  });

  it('vide le tampon à la réinitialisation (sortie d\'écran)', () => {
    const b = createScanBuffer();
    b.push('9', 1000); b.push('9', 1010);
    b.reset();
    expect(scan(b, 'BBB222', 2000)).toBe('BBB222');
  });
});

describe('index des codes', () => {
  const A = { id: 'a', barcode: '111', sku: 'REF-A', extra_barcodes: ['111-BIS'] };
  const B = { id: 'b', barcode: '222', sku: 'REF-B', extra_barcodes: null };
  const index = buildCodeIndex([A, B]);

  it('résout le code principal', () => {
    expect(index.get(normalizeCode('222'))).toBe(B);
  });

  it('résout la référence interne', () => {
    expect(index.get(normalizeCode('REF-B'))).toBe(B);
  });

  it('résout un code additionnel', () => {
    expect(index.get(normalizeCode('111-BIS'))).toBe(A);
  });

  it('ignore la casse et les espaces', () => {
    expect(index.get(normalizeCode('  ref-b '))).toBe(B);
  });

  it('ne rend RIEN pour un code inconnu — jamais un article « au hasard »', () => {
    expect(index.get(normalizeCode('999'))).toBeUndefined();
  });

  it('ne laisse pas un doublon de code écraser le premier article indexé', () => {
    const dup = buildCodeIndex([A, { id: 'c', barcode: '111', sku: null }]);
    expect(dup.get('111')).toBe(A);
  });

  it('résout B juste après A (scénario du bug)', () => {
    const b = createScanBuffer();
    const first = scan(b, '111', 1000);
    const second = scan(b, '222', 1500);
    expect(index.get(normalizeCode(first!))).toBe(A);
    expect(index.get(normalizeCode(second!))).toBe(B);
  });
});

/**
 * Validation automatique sur inactivité : elle n'existe que pour les
 * douchettes qui n'envoient aucun terminateur. Elle ne doit jamais
 * transformer une recherche par nom en scan.
 */
describe('reconnaissance d\'un code', () => {
  it('accepte un EAN', () => {
    expect(looksLikeCode('3401579847521')).toBe(true);
  });

  it('accepte une référence en majuscules', () => {
    expect(looksLikeCode('PROD-A-001')).toBe(true);
  });

  it('refuse une recherche par nom', () => {
    expect(looksLikeCode('rose avalanche')).toBe(false);
    expect(looksLikeCode('Eucalyptus')).toBe(false);
  });

  it('refuse un texte trop court', () => {
    expect(looksLikeCode('rose')).toBe(false);
    expect(looksLikeCode('12345')).toBe(false);
  });
});
