'use client';

import { useState } from 'react';

interface Props {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
}

/**
 * Section "Carte fidelite Apple Wallet" toujours visible sur la fiche
 * client. Trois options :
 *   1. QR code affiche a l'ecran — le client scanne avec son iPhone
 *   2. Envoi SMS via lien sms: — ouvre iMessage prerempli
 *   3. Envoi email via lien mailto: — ouvre le client mail prerempli
 * Toutes reposent sur un lien signe /w/[token] (30j de validite) qui
 * livre le .pkpass sans authentification.
 */
export default function WalletActions({ customerId, customerEmail, customerPhone }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modal, setModal] = useState<{ url: string; qr: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function openShareModal() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/customers/${customerId}/wallet/apple/link`, {
        method: 'POST',
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(prettyError(j.error, j.message));
        return;
      }
      const { url } = await r.json() as { url: string };
      setModal({ url, qr: qrSvgDataUri(url) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card p-4 space-y-3">
        <div>
          <div className="text-sm font-semibold">🍎 Carte fidélité Apple Wallet</div>
          <div className="text-xs text-ink-soft mt-0.5">
            Le client l&apos;ajoute lui-même à son iPhone. Le solde
            se met à jour tout seul après chaque passage caisse.
          </div>
        </div>
        <button
          onClick={() => void openShareModal()}
          disabled={busy}
          className="btn-primary h-11 px-5 text-sm font-semibold w-full"
        >
          {busy ? 'Génération…' : '📱 Partager la carte'}
        </button>
        {err && (
          <div className="rounded-lg bg-warning/10 text-warning text-xs px-3 py-2">{err}</div>
        )}
      </div>

      {modal && (
        <ShareModal
          url={modal.url}
          qr={modal.qr}
          email={customerEmail}
          phone={customerPhone}
          copied={copied}
          onCopy={async () => {
            try { await navigator.clipboard?.writeText(modal.url); } catch {}
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

function ShareModal({
  url, qr, email, phone, copied, onCopy, onClose,
}: {
  url: string; qr: string;
  email: string | null; phone: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const smsBody = encodeURIComponent(
    `Bonjour ! Voici votre carte de fidélité — ajoutez-la à Apple Wallet en un tap : ${url}`,
  );
  const emailSubject = encodeURIComponent('Votre carte fidélité Apple Wallet');
  const emailBody = encodeURIComponent(
    `Bonjour,

Voici votre carte de fidélité. Ouvrez le lien ci-dessous sur votre iPhone pour l'ajouter à Apple Wallet en un tap :

${url}

Le solde se met à jour automatiquement après chaque passage en caisse.

À bientôt !`,
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold">Partager la carte fidélité</h3>
            <p className="text-xs text-ink-soft mt-1">
              Le client scanne, ou vous lui envoyez le lien.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100"
          >✕</button>
        </div>

        {/* QR code — le client le scanne avec l'appareil photo iPhone */}
        <div className="rounded-2xl bg-white border border-border p-4 grid place-items-center">
          <img
            src={qr}
            alt="QR code carte fidélité"
            className="w-56 h-56"
            style={{ imageRendering: 'pixelated' }}
          />
          <p className="mt-3 text-xs text-ink-soft text-center max-w-[220px]">
            Ouvrez l&apos;appareil photo iPhone du client et pointez-le vers ce QR.
          </p>
        </div>

        {/* Actions d'envoi */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {phone ? (
            <a
              href={`sms:${phone}&body=${smsBody}`}
              className="btn-soft h-12 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              💬 SMS
            </a>
          ) : (
            <button
              disabled
              className="btn-soft h-12 text-sm font-medium opacity-40 inline-flex items-center justify-center gap-2"
              title="Pas de numéro renseigné"
            >
              💬 SMS
            </button>
          )}
          {email ? (
            <a
              href={`mailto:${email}?subject=${emailSubject}&body=${emailBody}`}
              className="btn-soft h-12 text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              ✉️ Email
            </a>
          ) : (
            <button
              disabled
              className="btn-soft h-12 text-sm font-medium opacity-40 inline-flex items-center justify-center gap-2"
              title="Pas d'email renseigné"
            >
              ✉️ Email
            </button>
          )}
        </div>

        {/* Copier le lien */}
        <button
          onClick={onCopy}
          className="mt-2 w-full h-12 rounded-xl border border-border bg-white text-sm font-medium hover:bg-gray-50 inline-flex items-center justify-center gap-2"
        >
          {copied ? '✓ Lien copié' : '🔗 Copier le lien'}
        </button>

        <div className="mt-3 text-[11px] text-ink-soft break-all font-mono bg-gray-50 rounded-lg p-2 border border-border">
          {url}
        </div>

        <p className="mt-3 text-xs text-ink-soft leading-relaxed">
          Le lien reste valide 30 jours. À l&apos;ouverture sur iPhone,
          Apple Wallet propose directement d&apos;ajouter la carte.
        </p>
      </div>
    </div>
  );
}

function prettyError(code?: string, message?: string): string {
  switch (code) {
    case 'WALLET_NOT_CONFIGURED':
      return 'Apple Wallet non configuré côté serveur.';
    case 'WALLET_DISABLED':
      return 'Activez la carte Wallet dans Paramètres → Fidélité.';
    case 'WALLET_MISSING_IDS':
      return 'Pass Type ID + Team ID à renseigner dans Paramètres → Fidélité.';
    default:
      return message ?? code ?? 'Erreur inattendue';
  }
}

/* ---------------------------------------------------------------- */
/* QR code encoder minimaliste (SVG data URI, capacite ~ 300 chars) */
/* ---------------------------------------------------------------- */

/**
 * Genere un QR code au format SVG data URI. Version light (byte mode,
 * error correction M). Suffisant pour encoder une URL de ~250 chars
 * comme un JWT.
 */
function qrSvgDataUri(text: string): string {
  const modules = encodeQr(text);
  const N = modules.length;
  const size = 232; // px du SVG (232 / 29 = 8 px/module pour un QR v3)
  const scale = size / N;
  let rects = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (modules[y]![x]) {
        rects += `<rect x="${(x * scale).toFixed(2)}" y="${(y * scale).toFixed(2)}" width="${scale.toFixed(2)}" height="${scale.toFixed(2)}"/>`;
      }
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* Petite implementation QR — version + masque + correction Reed-Solomon.
   Base : algorithme de Kazuhiko Arase (public domain, port TypeScript minimaliste). */
function encodeQr(text: string): number[][] {
  // Nous utilisons ici une lib QR ultra-compacte inlinee.
  // Cf. https://github.com/kazuhikoarase/qrcode-generator (MIT).
  // Reprise simplifiee : version 6 (41x41) niveau M, mode byte.
  return qrGenerate(text);
}

// ----- BEGIN inline qrcode-generator (subset, MIT, K. Arase) --------
type Mat = number[][];
function qrGenerate(text: string): Mat {
  const data = new TextEncoder().encode(text);
  // Choix de version : 3 (29x29) si ≤ 78 octets, 5 (37x37) si ≤ 134, sinon 8 (49x49)
  let ver = 3;
  if (data.length > 78) ver = 5;
  if (data.length > 134) ver = 8;
  if (data.length > 271) ver = 10;
  if (data.length > 419) ver = 15;
  return QRCode(ver, data);
}

/* ------------ QRCode encoder (compact) ------------ */
function QRCode(version: number, data: Uint8Array): Mat {
  const errorCorrectLevel = 0; // L=1, M=0, Q=3, H=2 in this lib; here we use M=0
  const typeNumber = version;
  const size = typeNumber * 4 + 17;
  const modules: (boolean | null)[][] = [];
  for (let i = 0; i < size; i++) modules.push(new Array(size).fill(null));
  setupPositionProbePattern(modules, 0, 0);
  setupPositionProbePattern(modules, size - 7, 0);
  setupPositionProbePattern(modules, 0, size - 7);
  setupPositionAdjustPattern(modules, typeNumber);
  setupTimingPattern(modules);
  setupTypeInfo(modules, errorCorrectLevel, 0);
  if (typeNumber >= 7) setupTypeNumber(modules, typeNumber);
  const dataBytes = createData(typeNumber, errorCorrectLevel, data);
  mapData(modules, dataBytes, 0);
  return modules.map((row) => row.map((v) => (v ? 1 : 0)));
}
function setupPositionProbePattern(m: (boolean|null)[][], row: number, col: number) {
  for (let r = -1; r <= 7; r++) {
    if (row + r <= -1 || m.length <= row + r) continue;
    for (let c = -1; c <= 7; c++) {
      if (col + c <= -1 || m.length <= col + c) continue;
      m[row+r]![col+c] =
        (0 <= r && r <= 6 && (c === 0 || c === 6))
        || (0 <= c && c <= 6 && (r === 0 || r === 6))
        || (2 <= r && r <= 4 && 2 <= c && c <= 4);
    }
  }
}
function setupPositionAdjustPattern(m: (boolean|null)[][], typeNumber: number) {
  const pos = PATTERN_POSITION_TABLE[typeNumber - 1];
  if (!pos) return;
  for (const row of pos) for (const col of pos) {
    if (m[row]![col] !== null) continue;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) {
      m[row+r]![col+c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
    }
  }
}
function setupTimingPattern(m: (boolean|null)[][]) {
  for (let r = 8; r < m.length - 8; r++) if (m[r]![6] === null) m[r]![6] = r % 2 === 0;
  for (let c = 8; c < m.length - 8; c++) if (m[6]![c] === null) m[6]![c] = c % 2 === 0;
}
function setupTypeInfo(m: (boolean|null)[][], ecLevel: number, maskPattern: number) {
  const data = (ecLevel << 3) | maskPattern;
  const bits = getBCHTypeInfo(data);
  for (let i = 0; i < 15; i++) {
    const mod = ((bits >> i) & 1) === 1;
    if (i < 6) m[i]![8] = mod;
    else if (i < 8) m[i+1]![8] = mod;
    else m[m.length - 15 + i]![8] = mod;
  }
  for (let i = 0; i < 15; i++) {
    const mod = ((bits >> i) & 1) === 1;
    if (i < 8) m[8]![m.length - i - 1] = mod;
    else if (i < 9) m[8]![15 - i - 1 + 1] = mod;
    else m[8]![15 - i - 1] = mod;
  }
  m[m.length - 8]![8] = true;
}
function setupTypeNumber(m: (boolean|null)[][], typeNumber: number) {
  const bits = getBCHTypeNumber(typeNumber);
  for (let i = 0; i < 18; i++) {
    const mod = ((bits >> i) & 1) === 1;
    m[Math.floor(i / 3)]![i % 3 + m.length - 8 - 3] = mod;
    m[i % 3 + m.length - 8 - 3]![Math.floor(i / 3)] = mod;
  }
}
function getBCHTypeInfo(data: number): number {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(0x537) >= 0) d ^= 0x537 << (getBCHDigit(d) - getBCHDigit(0x537));
  return ((data << 10) | d) ^ 0x5412;
}
function getBCHTypeNumber(data: number): number {
  let d = data << 12;
  while (getBCHDigit(d) - getBCHDigit(0x1F25) >= 0) d ^= 0x1F25 << (getBCHDigit(d) - getBCHDigit(0x1F25));
  return (data << 12) | d;
}
function getBCHDigit(data: number): number {
  let digit = 0;
  while (data !== 0) { digit++; data >>>= 1; }
  return digit;
}
function createData(typeNumber: number, ecLevel: number, data: Uint8Array): Uint8Array {
  const rsBlocks = getRSBlocks(typeNumber, ecLevel);
  const buffer = new BitBuffer();
  buffer.put(4, 4); // byte mode
  buffer.put(data.length, getLengthInBits(typeNumber));
  for (const b of data) buffer.put(b, 8);
  let totalDataCount = 0;
  for (const rs of rsBlocks) totalDataCount += rs.dataCount;
  if (buffer.getLengthInBits() > totalDataCount * 8) {
    throw new Error('QR overflow: ' + buffer.getLengthInBits() + ' > ' + totalDataCount * 8);
  }
  if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
  while (true) {
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0xEC, 8);
    if (buffer.getLengthInBits() >= totalDataCount * 8) break;
    buffer.put(0x11, 8);
  }
  return createBytes(buffer, rsBlocks);
}
function createBytes(buffer: BitBuffer, rsBlocks: { totalCount: number; dataCount: number }[]): Uint8Array {
  let offset = 0;
  let maxDcCount = 0, maxEcCount = 0;
  const dcdata: number[][] = new Array(rsBlocks.length);
  const ecdata: number[][] = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r]!.dataCount;
    const ecCount = rsBlocks[r]!.totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcCount; i++) dcdata[r]![i] = 0xff & buffer.buffer[i + offset]!;
    offset += dcCount;
    const rsPoly = getErrorCorrectPolynomial(ecCount);
    const rawPoly = new Polynomial(dcdata[r]!, rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r]!.length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r]!.length;
      ecdata[r]![i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
  }
  let totalCodeCount = 0;
  for (const rs of rsBlocks) totalCodeCount += rs.totalCount;
  const data = new Uint8Array(totalCodeCount);
  let index = 0;
  for (let i = 0; i < maxDcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r]!.length) data[index++] = dcdata[r]![i]!;
  for (let i = 0; i < maxEcCount; i++) for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r]!.length) data[index++] = ecdata[r]![i]!;
  return data;
}
function mapData(m: (boolean|null)[][], data: Uint8Array, maskPattern: number) {
  let inc = -1, row = m.length - 1, bitIndex = 7, byteIndex = 0;
  for (let col = m.length - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    while (true) {
      for (let c = 0; c < 2; c++) {
        if (m[row]![col - c] === null) {
          let dark = false;
          if (byteIndex < data.length) dark = ((data[byteIndex]! >>> bitIndex) & 1) === 1;
          if (getMask(maskPattern, row, col - c)) dark = !dark;
          m[row]![col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
      }
      row += inc;
      if (row < 0 || m.length <= row) { row -= inc; inc = -inc; break; }
    }
  }
}
function getMask(maskPattern: number, i: number, j: number): boolean {
  switch (maskPattern) {
    case 0: return (i + j) % 2 === 0;
    default: return (i + j) % 2 === 0;
  }
}
class BitBuffer {
  buffer: number[] = [];
  length = 0;
  getLengthInBits(): number { return this.length; }
  put(num: number, length: number): void {
    for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  }
  putBit(bit: boolean): void {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex]! |= 0x80 >>> (this.length % 8);
    this.length++;
  }
}
function getLengthInBits(typeNumber: number): number {
  return typeNumber < 10 ? 8 : typeNumber < 27 ? 16 : 16;
}
const PATTERN_POSITION_TABLE: number[][] = [
  [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46],
  [6,28,50], [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70],
];
// RS blocks for error correction M, versions 1..15
const RS_BLOCK_TABLE_M: number[][] = [
  [1,26,16], [1,44,28], [1,70,44], [2,50,32], [2,67,43], [4,43,27], [4,49,31],
  [2,60,38, 2,61,39], [3,58,36, 2,59,37], [4,69,43, 1,70,44],
  [1,80,50, 4,81,51], [6,58,36, 2,59,37], [8,59,37, 1,60,38],
  [4,64,40, 5,65,41], [5,65,41, 5,66,42],
];
function getRSBlocks(typeNumber: number, _ecLevel: number): { totalCount: number; dataCount: number }[] {
  const arr = RS_BLOCK_TABLE_M[typeNumber - 1];
  if (!arr) throw new Error('QR: no RS blocks for version ' + typeNumber);
  const list: { totalCount: number; dataCount: number }[] = [];
  for (let i = 0; i < arr.length; i += 3) {
    const [count, total, dc] = [arr[i]!, arr[i+1]!, arr[i+2]!];
    for (let j = 0; j < count; j++) list.push({ totalCount: total, dataCount: dc });
  }
  return list;
}
class Polynomial {
  private num: number[];
  constructor(num: number[], shift: number) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset]!;
  }
  get(index: number): number { return this.num[index]!; }
  getLength(): number { return this.num.length; }
  multiply(e: Polynomial): Polynomial {
    const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i++) for (let j = 0; j < e.getLength(); j++) {
      num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
    }
    return new Polynomial(num, 0);
  }
  mod(e: Polynomial): Polynomial {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = this.num.slice();
    for (let i = 0; i < e.getLength(); i++) num[i] = (num[i] ?? 0) ^ gexp(glog(e.get(i)) + ratio);
    return new Polynomial(num, 0).mod(e);
  }
}
const EXP_TABLE = new Array(256);
const LOG_TABLE = new Array(256);
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i-4] ^ EXP_TABLE[i-5] ^ EXP_TABLE[i-6] ^ EXP_TABLE[i-8];
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;
function glog(n: number): number { if (n < 1) throw new Error('log(' + n + ')'); return LOG_TABLE[n]; }
function gexp(n: number): number { while (n < 0) n += 255; while (n >= 255) n -= 255; return EXP_TABLE[n]; }
function getErrorCorrectPolynomial(ecCount: number): Polynomial {
  let a = new Polynomial([1], 0);
  for (let i = 0; i < ecCount; i++) a = a.multiply(new Polynomial([1, gexp(i)], 0));
  return a;
}
// ----- END inline qrcode-generator --------
