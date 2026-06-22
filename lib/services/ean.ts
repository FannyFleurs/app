/**
 * Génère un code EAN-13 aléatoire valide (12 chiffres + checksum).
 * Le préfixe 200-299 est réservé aux codes internes (in-store),
 * idéal pour des produits non destinés à un référencement public.
 */
export function generateEan13(prefix: '20' | '21' | '22' | '23' | '24' | '25' | '26' | '27' | '28' | '29' = '20'): string {
  const digits: number[] = prefix.split('').map(Number);
  for (let i = digits.length; i < 12; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }
  // Checksum EAN-13 : somme des positions impaires * 1 + paires * 3, puis (10 - mod 10) mod 10
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i]! * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return digits.join('') + String(checksum);
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === Number(code[12]);
}
