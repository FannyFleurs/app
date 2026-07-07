/**
 * Apple Wallet loyalty pass — generation, signing, APNs push.
 *
 * Configuration attendue :
 *   - APPLE_WALLET_CERT_P12_B64      : le .p12 (Pass Signing Certificate) encode en base64
 *   - APPLE_WALLET_CERT_PASSWORD     : mot de passe du .p12
 *   - APPLE_WALLET_WWDR_PEM_B64      : le certificat intermediaire WWDR en PEM base64
 *     (telechargeable sur https://www.apple.com/certificateauthority/)
 *   - APPLE_WALLET_WEB_SERVICE_URL   : URL publique complete du web service Wallet
 *     (ex. https://webpos.example.com/api/wallet/apple)
 *
 * Sans le p12 + password, la generation echoue proprement avec NOT_CONFIGURED.
 */

import zlib from 'node:zlib';
import forge from 'node-forge';
import { PKPass } from 'passkit-generator';
import type { WalletPassSettings } from '@/lib/settings/pos-ui';

/* -------------------------------------------------------------------- */
/* Configuration                                                        */
/* -------------------------------------------------------------------- */

export interface AppleWalletConfig {
  p12Base64: string;
  p12Password: string;
  wwdrPemBase64: string;
  webServiceUrl: string;
}

export function readEnvConfig(): AppleWalletConfig | null {
  const p12 = process.env.APPLE_WALLET_CERT_P12_B64;
  const pwd = process.env.APPLE_WALLET_CERT_PASSWORD;
  const wwdr = process.env.APPLE_WALLET_WWDR_PEM_B64;
  const url = process.env.APPLE_WALLET_WEB_SERVICE_URL
    || process.env.APP_URL
    || process.env.VERCEL_URL;
  if (!p12 || !pwd || !wwdr) return null;
  return {
    p12Base64: p12,
    p12Password: pwd,
    wwdrPemBase64: wwdr,
    webServiceUrl: url ? normalizeUrl(url) + '/api/wallet/apple' : '',
  };
}

function normalizeUrl(u: string): string {
  return u.startsWith('http') ? u : `https://${u}`;
}

export function isConfigured(): boolean {
  return !!readEnvConfig();
}

/* -------------------------------------------------------------------- */
/* Extraction P12 -> PEM (signer cert + private key)                    */
/* -------------------------------------------------------------------- */

interface P12Extract { certPem: string; keyPem: string }

let _p12Cache: P12Extract | null = null;

function extractSignerFromP12(config: AppleWalletConfig): P12Extract {
  if (_p12Cache) return _p12Cache;

  const der = Buffer.from(config.p12Base64, 'base64').toString('binary');
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, config.p12Password);

  const certOid = forge.pki.oids.certBag!;
  const keyOid = forge.pki.oids.pkcs8ShroudedKeyBag!;
  const certBags = p12.getBags({ bagType: certOid });
  const keyBags = p12.getBags({ bagType: keyOid });

  const cert = certBags[certOid]?.[0]?.cert;
  const key = keyBags[keyOid]?.[0]?.key;
  if (!cert || !key) throw new Error('P12_INVALID: cert or key missing in bundle');

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(key);
  _p12Cache = { certPem, keyPem };
  return _p12Cache;
}

/* -------------------------------------------------------------------- */
/* PNG builder (solid color)                                            */
/* -------------------------------------------------------------------- */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// CRC32 (table-based) — same polynomial as PNG spec.
let _crcTable: Uint32Array | null = null;
function crc32(buf: Buffer): number {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]!) & 0xFF]! ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Genere un PNG plein aplat aux dimensions demandees. */
export function solidColorPng(width: number, height: number, hex: string): Buffer {
  const [r, g, b] = hexToRgb(hex);
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type: RGB
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = r;
      raw[off + 2 + x * 3] = g;
      raw[off + 3 + x * 3] = b;
    }
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- */
/* Pass generation                                                      */
/* -------------------------------------------------------------------- */

export interface PassSubject {
  customerId: string;
  customerName: string;
  organizationName: string;
  loyaltyBalanceEuros: number;
  loyaltyPoints: number | null;
  memberSince: Date;
  serialNumber: string;
  authenticationToken: string;
}

/**
 * Construit et signe un .pkpass pour le programme fidelite Webpos.
 * Retourne un Buffer directement utilisable pour envoi HTTP (content-type
 * application/vnd.apple.pkpass).
 */
export async function generateLoyaltyPass(
  subject: PassSubject,
  settings: WalletPassSettings,
): Promise<Buffer> {
  const config = readEnvConfig();
  if (!config) throw new Error('WALLET_NOT_CONFIGURED');
  if (!settings.pass_type_id || !settings.team_id) {
    throw new Error('WALLET_MISSING_IDS');
  }

  const { certPem, keyPem } = extractSignerFromP12(config);
  const wwdrPem = Buffer.from(config.wwdrPemBase64, 'base64').toString('utf8');

  const bg = settings.background_color || '#556B3E';
  const fg = settings.foreground_color || '#F5F1E8';
  const logoText = settings.logo_text || subject.organizationName;
  const primaryLabel = settings.primary_label || 'Solde fidélité';

  // pass.json descriptor
  const passJson: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: settings.pass_type_id,
    teamIdentifier: settings.team_id,
    serialNumber: subject.serialNumber,
    organizationName: subject.organizationName,
    description: `Carte fidélité ${subject.organizationName}`,
    logoText,
    backgroundColor: rgbCss(bg),
    foregroundColor: rgbCss(fg),
    labelColor: rgbCss(fg),
    authenticationToken: subject.authenticationToken,
    webServiceURL: config.webServiceUrl || undefined,
    storeCard: {
      primaryFields: [
        { key: 'balance', label: primaryLabel,
          value: subject.loyaltyBalanceEuros,
          currencyCode: 'EUR' },
      ],
      secondaryFields: buildSecondaryFields(subject, settings),
      auxiliaryFields: [],
      backFields: buildBackFields(subject, settings),
    },
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: subject.serialNumber,
      messageEncoding: 'iso-8859-1',
      altText: subject.serialNumber,
    }],
  };

  // Icons + logo : PNG aplat pour l'instant, colorises avec le fond du pass.
  // L'org pourra uploader ses propres visuels ulterieurement.
  const icon29 = solidColorPng(29, 29, bg);
  const icon58 = solidColorPng(58, 58, bg);
  const icon87 = solidColorPng(87, 87, bg);
  const logo1x = solidColorPng(160, 50, bg);
  const logo2x = solidColorPng(320, 100, bg);

  const pass = new PKPass(
    {
      'pass.json': Buffer.from(JSON.stringify(passJson), 'utf8'),
      'icon.png': icon29,
      'icon@2x.png': icon58,
      'icon@3x.png': icon87,
      'logo.png': logo1x,
      'logo@2x.png': logo2x,
    },
    {
      wwdr: wwdrPem,
      signerCert: certPem,
      signerKey: keyPem,
    },
  );

  const buf = pass.getAsBuffer();
  return buf;
}

function rgbCss(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

function buildSecondaryFields(subject: PassSubject, s: WalletPassSettings): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (s.show_points && subject.loyaltyPoints != null) {
    out.push({ key: 'points', label: 'Points', value: subject.loyaltyPoints });
  }
  if (s.show_since) {
    const d = subject.memberSince;
    out.push({
      key: 'since',
      label: 'Depuis',
      value: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
    });
  }
  out.push({ key: 'name', label: 'Membre', value: subject.customerName });
  return out;
}

function buildBackFields(subject: PassSubject, s: WalletPassSettings): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (s.back_message) {
    out.push({ key: 'message', label: 'Programme', value: s.back_message });
  }
  out.push({
    key: 'serial',
    label: 'Numéro fidélité',
    value: subject.serialNumber,
  });
  out.push({
    key: 'terms',
    label: 'Informations',
    value:
      'Le solde se met à jour automatiquement après chaque passage en caisse. '
      + 'Pour supprimer cette carte, faites glisser vers la gauche dans Apple Wallet.',
  });
  return out;
}

/* -------------------------------------------------------------------- */
/* APNs push (Wallet)                                                    */
/* -------------------------------------------------------------------- */

/**
 * Envoie un push APNs vide (Wallet) aux devices dont on a les tokens.
 * Le pass sera automatiquement mis a jour au prochain appel du web
 * service — le push notifie juste l'iPhone qu'un changement existe.
 *
 * Utilise le certificat signer (auth par certificat client, pas JWT).
 */
export async function sendUpdatePush(
  passTypeId: string,
  deviceTokens: string[],
): Promise<{ sent: number; failed: number }> {
  if (deviceTokens.length === 0) return { sent: 0, failed: 0 };
  const config = readEnvConfig();
  if (!config) return { sent: 0, failed: deviceTokens.length };

  const { certPem, keyPem } = extractSignerFromP12(config);

  // Import dynamique de http2 pour ne pas alourdir le bundle client.
  const http2 = await import('node:http2');
  const client = http2.connect('https://api.push.apple.com:443', {
    cert: certPem,
    key: keyPem,
  });

  let sent = 0, failed = 0;
  await Promise.all(deviceTokens.map((token) => new Promise<void>((resolve) => {
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      'apns-topic': passTypeId,
      'apns-push-type': 'background',
      'content-type': 'application/json',
    });
    req.setEncoding('utf8');
    let status = 0;
    req.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    req.on('end', () => {
      if (status === 200) sent++; else failed++;
      resolve();
    });
    req.on('error', () => { failed++; resolve(); });
    req.end('{}');
  })));

  client.close();
  return { sent, failed };
}

/* -------------------------------------------------------------------- */
/* Helpers publics                                                       */
/* -------------------------------------------------------------------- */

/** Serial number stable pour un couple (customerId × passTypeId). */
export function computeSerial(customerId: string): string {
  const id = customerId.replace(/-/g, '').slice(0, 12).toUpperCase();
  return `FID-${id.slice(0, 4)}-${id.slice(4, 8)}`;
}

/** authenticationToken aleatoire pour securiser le web service. */
export function randomAuthToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
}
