declare module '@point-of-sale/receipt-printer-encoder' {
  export default class ReceiptPrinterEncoder {
    constructor(options?: Record<string, unknown>);

    initialize(): this;
    codepage(value: string): this;
    text(value: string): this;
    line(value: string): this;
    newline(count?: number): this;
    align(value: 'left' | 'center' | 'right'): this;
    bold(value?: boolean): this;
    underline(value?: boolean): this;
    italic(value?: boolean): this;
    invert(value?: boolean): this;
    width(value?: number): this;
    height(value?: number): this;
    size(width: number, height?: number): this;
    font(value: string): this;

    barcode(
      value: string,
      symbology: string,
      options?: number | {
        height?: number;
        width?: number;
        text?: boolean;
      }
    ): this;

    qrcode(
      value: string,
      options?: {
        model?: number;
        size?: number;
        errorlevel?: 'l' | 'm' | 'q' | 'h';
      }
    ): this;

    image(
      image: unknown,
      width: number,
      height: number,
      algorithm?: string,
      threshold?: number
    ): this;

    cut(type?: 'full' | 'partial'): this;
    pulse(
      connector?: number,
      onTime?: number,
      offTime?: number
    ): this;

    raw(data: Uint8Array | number[]): this;

    encode(format?: 'commands' | 'lines'): Uint8Array;

    readonly columns: number;
    readonly language: string;
    readonly printerCapabilities: unknown;

    static readonly printerModels: Array<{
      id: string;
      name: string;
    }>;
  }
}
