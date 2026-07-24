/**
 * Déclarations de types minimales pour `star-prnt-encoder` (pas de types
 * fournis par le paquet). API fluide : chaque méthode renvoie l'instance,
 * `encode()` renvoie les octets StarPRNT à envoyer à l'imprimante.
 */
declare module 'star-prnt-encoder' {
  interface StarPrntEncoderOptions {
    columns?: number;
    language?: string;
    width?: number;
  }
  class StarPrntEncoder {
    constructor(options?: StarPrntEncoderOptions);
    initialize(): this;
    codepage(codepage: string): this;
    text(value: string): this;
    line(value: string): this;
    newline(): this;
    align(value: 'left' | 'center' | 'right'): this;
    bold(value?: boolean): this;
    underline(value?: boolean): this;
    invert(value?: boolean): this;
    width(value: number): this;
    height(value: number): this;
    size(value: number | string): this;
    barcode(value: string, symbology: string, height?: number | Record<string, unknown>): this;
    qrcode(value: string, ...args: unknown[]): this;
    image(
      element: { data: Uint8Array | Uint8ClampedArray; width: number; height: number },
      width: number,
      height: number,
      algorithm?: 'threshold' | 'bayer' | 'floydsteinberg' | 'atkinson',
      threshold?: number,
    ): this;
    cut(value?: string): this;
    raw(data: number[] | Uint8Array): this;
    encode(): Uint8Array;
  }
  export default StarPrntEncoder;
}
