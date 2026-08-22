import type { ReceiptSnapshot, OrgInfo } from '@/lib/services/receipt-pdf';
import type { ReceiptSettings } from '@/lib/settings/receipt';
import { round2 } from '@/lib/services/money';
import {
  createNativeReceiptEncoder,
  encodeNativePrinterData,
  type NativePrinterLanguage,
} from './encoder';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Especes',
  card: 'Carte Bancaire',
  check: 'Cheque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'En compte',
  other: 'Autre',
};

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '');

const n2 = (x: number) => x.toFixed(2).replace('.', ',');
const eur = (x: number) => `${n2(x)} EUR`;

const qty = (q: number) =>
  Number.isInteger(q)
    ? String(q)
    : String(q).replace('.', ',');

export interface NativeReceiptOptions {
  fiscalHash: string;
  cashier?: string | null;
  receipt?: ReceiptSettings | null;
  giftReceipt?: boolean;
  giftLineIndices?: number[] | null;
  customerName?: string | null;
  loyalty?: {
    earned: number;
    balance: number;
    redeemed: number;
  } | null;

  paperWidthMm?: 58 | 80;
  language?: NativePrinterLanguage;
  printerModel?: string;
}

/**
 * Ticket brut pour l'application native.
 *
 * IMPORTANT :
 * - indépendant de CloudPRNT ;
 * - aucun changement sur buildReceiptStarPrnt ;
 * - produit seulement les octets imprimante.
 */
export async function buildNativeReceipt(
  snapshot: ReceiptSnapshot,
  org: OrgInfo,
  options: NativeReceiptOptions,
): Promise<Uint8Array> {
  const rs = options.receipt ?? null;
  const gift = options.giftReceipt === true;
  const W = options.paperWidthMm === 58 ? 32 : 48;
  const wide = W >= 48;

  const enc = createNativeReceiptEncoder({
    paperWidthMm: options.paperWidthMm ?? 80,
    language: options.language ?? 'star-prnt',
    printerModel: options.printerModel,
  });

  const rowStr = (left: string, right: string) => {
    const l = ascii(left);
    const r = ascii(right);

    const maxLeft = Math.max(
      0,
      W - r.length - 1,
    );

    const clipped =
      l.length > maxLeft
        ? l.slice(0, maxLeft)
        : l;

    return (
      clipped +
      ' '.repeat(
        Math.max(
          1,
          W - clipped.length - r.length,
        ),
      ) +
      r
    );
  };

  const center = (
    text: string,
    bold = false,
  ) => {
    enc.align('center');

    if (bold) enc.bold(true);

    enc.line(ascii(text));

    if (bold) enc.bold(false);

    enc.align('left');
  };

  const left = (text = '') => {
    enc.align('left');
    enc.line(ascii(text));
  };

  const rule = () => {
    left('-'.repeat(W));
  };

  const row = (
    label: string,
    value: string,
    bold = false,
  ) => {
    enc.align('left');

    if (bold) enc.bold(true);

    enc.line(rowStr(label, value));

    if (bold) enc.bold(false);
  };

  /*
   * En-tête.
   *
   * Première version volontairement TEXTE :
   * on ajoutera logo/image seulement après validation
   * du flux brut natif.
   */
  const shopName =
    rs?.shop_name?.trim() ||
    org.name ||
    'HelloPos';

  center(shopName, true);

  const address1 =
    rs?.address_line1?.trim() ||
    org.address?.line1;

  if (address1) center(address1);

  const zipCity =
    rs?.address_zip_city?.trim() ||
    [org.address?.zip, org.address?.city]
      .filter(Boolean)
      .join(' ');

  if (zipCity) center(zipCity);

  const phone =
    rs?.phone?.trim() ||
    org.phone;

  if (phone) center(phone);

  const siret =
    rs?.siret?.trim() ||
    org.siret;

  if (siret) {
    center(`Siret : ${siret}`);
  }

  const vat =
    rs?.vat_number?.trim() ||
    org.vat_number;

  if (vat) {
    center(`TVA : ${vat}`);
  }

  const website =
    rs?.website?.trim();

  if (website) {
    center(website);
  }

  rule();

  center(
    `Ticket ${snapshot.receipt_number}${gift ? '' : ' - VENTE'}`,
  );

  if (gift) {
    center('TICKET SANS PRIX', true);
  }

  const date =
    new Date(snapshot.validated_at);

  center(
    date.toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );

  rule();

  if (options.cashier) {
    left(`Servis par: ${options.cashier}`);
  }

  if (
    snapshot.comment &&
    snapshot.comment.trim()
  ) {
    rule();

    enc.bold(true);
    left('Commentaire :');
    enc.bold(false);

    left(snapshot.comment.trim());
  }

  rule();

  const rates = [
    ...new Set(
      snapshot.tva_breakdown.map(
        (t) => t.rate,
      ),
    ),
  ].sort((a, b) => b - a);

  const codeOf = new Map(
    rates.map(
      (rate, index) => [
        rate,
        String.fromCharCode(65 + index),
      ],
    ),
  );

  if (gift) {
    const selected =
      options.giftLineIndices;

    const lines =
      selected && selected.length
        ? snapshot.lines.filter(
            (_, index) =>
              selected.includes(index),
          )
        : snapshot.lines;

    enc.bold(true);
    left('QTE DESC');
    enc.bold(false);

    for (const line of lines) {
      left(
        `${qty(line.quantity)} ${line.label}`,
      );
    }
  } else {
    row(
      'QTE DESC',
      wide
        ? 'PU   MONTANT'
        : 'MONTANT',
      true,
    );

    for (const line of snapshot.lines) {
      const gross =
        round2(
          line.unit_price_ttc *
            line.quantity,
        );

      const code =
        codeOf.get(line.tax_rate) ?? '';

      const right =
        wide
          ? `${n2(line.unit_price_ttc)} ${n2(gross)} ${code}`
          : `${n2(gross)} ${code}`;

      row(
        `${qty(line.quantity)} ${line.label}`,
        right,
      );

      if (line.discount_amount > 0) {
        const pct =
          gross > 0
            ? (
                line.discount_amount /
                gross
              ) * 100
            : 0;

        row(
          `  Remise ${pct.toFixed(0)}%`,
          `-${n2(line.discount_amount)}`,
        );
      }
    }
  }

  rule();

  if (!gift) {
    if (
      snapshot.totals.total_discount > 0
    ) {
      const gross =
        round2(
          snapshot.totals.total_ttc +
            snapshot.totals.total_discount,
        );

      row(
        'Sous total :',
        eur(gross),
      );

      row(
        'Reduction lignes :',
        `-${eur(
          snapshot.totals.total_discount,
        )}`,
      );
    }

    enc.bold(true);
    enc.width(2);
    enc.height(2);

    left(
      `TOTAL: ${eur(
        snapshot.totals.total_ttc,
      )}`,
    );

    enc.width(1);
    enc.height(1);
    enc.bold(false);

    rule();

    let change = 0;

    for (
      const payment of snapshot.payments
    ) {
      const label =
        PAYMENT_LABELS[
          payment.method
        ] ?? payment.method;

      if (
        payment.method === 'cash' &&
        payment.given_amount != null &&
        payment.given_amount >
          payment.amount
      ) {
        change =
          round2(
            change +
              (
                payment.given_amount -
                payment.amount
              ),
          );

        row(
          label,
          eur(payment.given_amount),
        );
      } else {
        row(
          label,
          eur(payment.amount),
        );
      }
    }

    if (change > 0) {
      row(
        'Rendu',
        eur(change),
        true,
      );
    }

    rule();

    if (
      (rs?.show_tax_breakdown ?? true) &&
      snapshot.tva_breakdown.length > 0
    ) {
      left('Detail TVA');

      const ordered = [
        ...snapshot.tva_breakdown,
      ].sort(
        (a, b) => b.rate - a.rate,
      );

      for (const tva of ordered) {
        row(
          `  TVA ${n2(tva.rate)}% (HT ${n2(tva.base_ht)})`,
          n2(tva.tva),
        );
      }

      row(
        'Total HT',
        n2(snapshot.totals.total_ht),
      );

      row(
        'Total TVA',
        n2(snapshot.totals.total_tva),
        true,
      );

      rule();
    }

    const loyalty =
      options.loyalty;

    const hasLoyalty =
      !!loyalty &&
      (
        loyalty.earned > 0 ||
        loyalty.redeemed > 0 ||
        loyalty.balance > 0
      );

    if (
      options.customerName ||
      hasLoyalty
    ) {
      if (options.customerName) {
        center(
          options.customerName,
          true,
        );
      }

      if (
        hasLoyalty &&
        loyalty
      ) {
        center(
          'Points de fidelite:',
        );

        const parts = [
          `Total: ${loyalty.balance}`,
          `Ticket: ${loyalty.earned}`,
        ];

        if (
          loyalty.redeemed > 0
        ) {
          parts.push(
            `Utilises: ${loyalty.redeemed}`,
          );
        }

        center(parts.join(' | '));
      }

      rule();
    }

    const totalQty =
      snapshot.lines.reduce(
        (sum, line) =>
          sum + line.quantity,
        0,
      );

    row(
      'Nombre de produit :',
      qty(totalQty),
    );

    row(
      'Nombre de ligne :',
      String(snapshot.lines.length),
    );

    rule();
  }

  if (
    rs?.show_barcode ?? true
  ) {
    enc.newline();
    enc.align('center');

    try {
      enc.barcode(
        snapshot.receipt_number,
        'code128',
        {
          height: 60,
          width: 2,
          text: false,
        },
      );
    } catch {
      // Pas de blocage si code-barres incompatible.
    }

    enc.align('left');
  }

  if (!gift) {
    enc.newline();

    center(
      'Ticket disponible par email sur demande.',
    );
  }

  if (
    rs?.footer_message?.trim()
  ) {
    enc.newline();
    center(
      rs.footer_message.trim(),
    );
  }

  if (
    rs?.welcome_message?.trim()
  ) {
    center(
      rs.welcome_message.trim(),
    );
  }

  enc.align('left');
  enc.newline(5);
  enc.cut('full');

  return encodeNativePrinterData(enc);
}
