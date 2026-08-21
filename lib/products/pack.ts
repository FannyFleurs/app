/** Nombre maximum de composants dans un pack. */
export const MAX_PACK_ITEMS = 5;

export interface PackComponentPrice {
  price: number;    // prix de vente TTC du composant
  quantity: number; // quantité dans le pack
}

/** Total des composants (avant remise). */
export function packComponentsTotal(components: PackComponentPrice[]): number {
  const sum = components.reduce((s, c) => s + c.price * c.quantity, 0);
  return Number(sum.toFixed(2));
}

/** Prix final du pack = total des composants − remise (jamais négatif). */
export function computePackPrice(components: PackComponentPrice[], discount: number): number {
  const net = packComponentsTotal(components) - Math.max(0, discount || 0);
  return Number(Math.max(0, net).toFixed(2));
}
