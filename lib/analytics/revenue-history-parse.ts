import ExcelJS from 'exceljs';

/** Ligne brute d'un import d'historique de CA (avant validation métier). */
export interface RawRevenueRow {
  /** Date au format ISO (yyyy-mm-dd) si reconnue, sinon la valeur brute. */
  day: string;
  /** Nom de boutique tel qu'écrit dans le fichier. */
  store: string;
  ca_ttc: number | null;
  ca_ht: number | null;
  tickets: number | null;
}

type ColKey = 'day' | 'store' | 'ca_ttc' | 'ca_ht' | 'tickets';

/** Colonnes du modèle (entêtes FR) + exemples génériques. */
export const REVENUE_COLUMNS: Array<{ key: ColKey; header: string; width: number }> = [
  { key: 'day',     header: 'Date',                 width: 14 },
  { key: 'store',   header: 'Boutique',             width: 24 },
  { key: 'ca_ttc',  header: 'CA TTC (€)',           width: 16 },
  { key: 'ca_ht',   header: 'CA HT (€)',            width: 16 },
  { key: 'tickets', header: 'Nombre de tickets',    width: 18 },
];

/** Normalise un entête : minuscules, sans accents, sans ponctuation. */
function normHeader(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const HEADER_ALIASES: Record<ColKey, string[]> = {
  day: ['date', 'jour', 'journee', 'day'],
  store: ['boutique', 'magasin', 'store', 'point de vente', 'pdv', 'shop'],
  ca_ttc: ['ca ttc', 'chiffre d affaires ttc', 'ca', 'ventes ttc', 'total ttc', 'montant ttc'],
  ca_ht: ['ca ht', 'chiffre d affaires ht', 'ventes ht', 'total ht', 'montant ht'],
  tickets: ['nombre de tickets', 'nb tickets', 'tickets', 'transactions', 'nb ventes'],
};

const NORM_TO_KEY = new Map<string, ColKey>();
for (const key of Object.keys(HEADER_ALIASES) as ColKey[]) {
  for (const alias of HEADER_ALIASES[key]) NORM_TO_KEY.set(normHeader(alias), key);
}
function resolveHeaderKey(rawHeader: string): ColKey | null {
  return NORM_TO_KEY.get(normHeader(rawHeader)) ?? null;
}

function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const v = Number(t.replace(/\s/g, '').replace(',', '.').replace(/€/g, ''));
  return Number.isFinite(v) ? v : NaN;
}
function toInt(s: string): number | null {
  const n = toNum(s);
  if (n == null) return null;
  if (Number.isNaN(n)) return NaN;
  return Math.round(n);
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }
function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Normalise une date de cellule vers yyyy-mm-dd. Gère :
 * - un objet Date (cellule au format date d'Excel),
 * - un numéro de série Excel (jours depuis le 30/12/1899),
 * - une chaîne « jj/mm/aaaa », « jj-mm-aaaa » ou « aaaa-mm-jj ».
 * Renvoie null si non reconnu.
 */
export function normalizeDay(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    // exceljs renvoie la date en UTC pour les cellules date : on lit les
    // composantes UTC pour éviter un décalage d'un jour.
    return isoFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Numéro de série Excel → date (base 1899-12-30).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return isoFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(value).trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return isoFromParts(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(s);
  if (m) return isoFromParts(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Parse un classeur XLSX (première feuille) avec entêtes FR. */
export async function parseRevenueImport(buf: Buffer): Promise<RawRevenueRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const headerKeys = new Map<number, ColKey>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const k = resolveHeaderKey(String(cell.text ?? cell.value ?? ''));
    if (k) headerKeys.set(col, k);
  });

  const rows: RawRevenueRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    let dayRaw: unknown = '';
    const text = new Map<ColKey, string>();
    headerKeys.forEach((k, col) => {
      const cell = row.getCell(col);
      if (k === 'day') { dayRaw = cell.value ?? cell.text ?? ''; return; }
      const t = cell.text != null ? String(cell.text) : (cell.value != null ? String(cell.value) : '');
      text.set(k, t.trim());
    });
    const store = text.get('store') ?? '';
    const caTtcRaw = text.get('ca_ttc') ?? '';
    const caHtRaw = text.get('ca_ht') ?? '';
    const ticketsRaw = text.get('tickets') ?? '';
    const iso = normalizeDay(dayRaw);
    // Ligne entièrement vide : on ignore.
    if (!iso && !store && !caTtcRaw && !caHtRaw && !ticketsRaw) return;
    rows.push({
      day: iso ?? String(dayRaw ?? '').trim(),
      store,
      ca_ttc: toNum(caTtcRaw),
      ca_ht: caHtRaw ? toNum(caHtRaw) : null,
      tickets: ticketsRaw ? toInt(ticketsRaw) : null,
    });
  });
  return rows;
}
