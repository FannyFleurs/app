/**
 * Cœur de l'import clients : lecture du classeur, normalisation d'une ligne, et
 * rapprochement avec les fiches existantes (dédoublonnage). Mutualisé entre
 * l'aperçu (`/api/customers/import/preview`) et l'import réel
 * (`/api/customers/import`), pour que les deux prennent EXACTEMENT les mêmes
 * décisions.
 *
 * Rapprochement, par ordre de priorité : e-mail, puis téléphone (comparé
 * chiffre à chiffre), puis nom (particulier) / société (pro). Une ligne n'est
 * fusionnée que si elle correspond à UNE SEULE fiche existante ; si plusieurs
 * correspondent, elle est marquée « ambiguë » (jamais de fusion hasardeuse).
 */
import ExcelJS from 'exceljs';
import { CUSTOMER_IMPORT_COLUMNS, CUSTOMER_TYPES, parseBool } from './import-columns';

export const MAX_ROWS = 5000;
/** En dessous de ce nombre de chiffres, un téléphone n'est pas un critère fiable. */
export const MIN_PHONE_DIGITS = 8;

export interface ParsedRow {
  rowNumber: number;
  type: string;
  first: string; last: string; company: string;
  email: string; phone: string;
  siret: string; vat_number: string;
  address: { line1: string; zip: string; city: string };
  consent_email: boolean; consent_sms: boolean;
  internal_notes: string; loyalty_code: string;
  hasPoints: boolean; points: number; // en euros de fidélité (déjà converti)
  label: string;
  error?: string;
}

/** Chiffres uniquement — pour comparer des numéros quel que soit le format. */
export function normPhone(s: string): string {
  return (s || '').replace(/[^0-9]/g, '');
}
/** Clé de rapprochement par nom : société si présente, sinon « prénom nom ». */
export function nameKey(first: string, last: string, company: string): string {
  const base = company && company.trim() ? company : `${first} ${last}`;
  return base.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Normalise une valeur de cellule exceljs (texte, lien, formule, richText). */
export function cellStr(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim();
    if (typeof o.result === 'string' || typeof o.result === 'number') return String(o.result).trim();
    if (Array.isArray(o.richText)) return o.richText.map((r) => (r as { text?: string }).text ?? '').join('').trim();
    if (o.hyperlink && typeof o.text === 'string') return String(o.text).trim();
  }
  return String(v).trim();
}

export async function parseCustomerWorkbook(
  buffer: Buffer, loyRate: number,
): Promise<{ headerError?: string; rows: ParsedRow[] }> {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); }
  catch { return { headerError: 'Fichier illisible : utilisez le modèle Excel fourni.', rows: [] }; }
  const ws = wb.worksheets[0];
  if (!ws) return { headerError: 'Fichier vide.', rows: [] };

  const headerToKey = new Map(CUSTOMER_IMPORT_COLUMNS.map((c) => [c.header.trim().toLowerCase(), c.key]));
  const colByKey: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, col) => {
    const key = headerToKey.get(cellStr(cell.value).toLowerCase());
    if (key) colByKey[key] = col;
  });
  if (colByKey.type === undefined && colByKey.first_name === undefined && colByKey.company_name === undefined) {
    return { headerError: 'En-têtes non reconnues : utilisez le modèle Excel fourni.', rows: [] };
  }

  const rows: ParsedRow[] = [];
  const lastRow = Math.min(ws.rowCount, MAX_ROWS + 1);
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const val = (key: string) => (colByKey[key] ? cellStr(row.getCell(colByKey[key]).value) : '');

    const first = val('first_name'), last = val('last_name'), company = val('company_name');
    const email = val('email'), phone = val('phone');
    if (![first, last, company, email, phone].some((v) => v)) continue; // ligne vide

    let type = val('type').toLowerCase();
    if (!(CUSTOMER_TYPES as readonly string[]).includes(type)) {
      type = company && !(first || last) ? 'professionnel' : 'particulier';
    }
    const isParticulier = type === 'particulier';

    const address = { line1: val('line1'), zip: val('zip'), city: val('city') };
    const pointsRaw = val('loyalty_points');
    const hasPoints = pointsRaw !== '';
    const rawPoints = hasPoints ? Number(pointsRaw.replace(',', '.')) : 0;

    const label = (company || `${first} ${last}`.trim() || email || phone).trim();
    const base: ParsedRow = {
      rowNumber: r, type, first, last, company, email, phone,
      siret: val('siret'), vat_number: val('vat_number'), address,
      consent_email: parseBool(val('consent_email')), consent_sms: parseBool(val('consent_sms')),
      internal_notes: val('internal_notes'), loyalty_code: val('loyalty_code'),
      hasPoints, points: 0, label,
    };

    if (isParticulier ? !(first || last) : !company) {
      base.error = isParticulier ? 'Nom/prénom manquant.' : 'Société manquante.';
      rows.push(base);
      continue;
    }
    if (hasPoints && !Number.isFinite(rawPoints)) {
      base.error = `Points fidélité invalides (« ${pointsRaw} »).`;
      rows.push(base);
      continue;
    }
    base.points = hasPoints ? Math.round(rawPoints * loyRate * 100) / 100 : 0;
    rows.push(base);
  }
  return { rows };
}

// --------------------------------------------------------------- Rapprochement

export interface ExistingCustomer {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}

export interface CustomerIndex {
  byEmail: Map<string, string[]>;
  byPhone: Map<string, string[]>;
  byName: Map<string, string[]>;
}

function push(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const arr = map.get(key);
  if (arr) arr.push(id); else map.set(key, [id]);
}

export function buildIndex(list: ExistingCustomer[]): CustomerIndex {
  const idx: CustomerIndex = { byEmail: new Map(), byPhone: new Map(), byName: new Map() };
  for (const c of list) addToIndex(idx, c);
  return idx;
}

/** Ajoute une fiche à l'index (utilisé aussi pour les créations en cours
 *  d'import, afin de dédoublonner deux lignes identiques du MÊME fichier). */
export function addToIndex(idx: CustomerIndex, c: ExistingCustomer) {
  if (c.email) push(idx.byEmail, c.email.trim().toLowerCase(), c.id);
  const ph = normPhone(c.phone ?? '');
  if (ph.length >= MIN_PHONE_DIGITS) push(idx.byPhone, ph, c.id);
  const nk = nameKey(c.first_name ?? '', c.last_name ?? '', c.company_name ?? '');
  if (nk) push(idx.byName, nk, c.id);
}

export type MatchAction = 'create' | 'update' | 'ambiguous';
export type MatchedBy = 'email' | 'téléphone' | 'nom';
export interface MatchResult { action: MatchAction; matchId?: string; matchedBy?: MatchedBy }

/** Décide de l'action pour une ligne, selon l'index des fiches existantes. */
export function matchRow(row: ParsedRow, idx: CustomerIndex): MatchResult {
  const consider = (ids: string[] | undefined, by: MatchedBy): MatchResult | null => {
    if (!ids || ids.length === 0) return null;
    if (ids.length === 1) return { action: 'update', matchId: ids[0], matchedBy: by };
    return { action: 'ambiguous', matchedBy: by };
  };

  if (row.email) {
    const res = consider(idx.byEmail.get(row.email.trim().toLowerCase()), 'email');
    if (res) return res;
  }
  const ph = normPhone(row.phone);
  if (ph.length >= MIN_PHONE_DIGITS) {
    const res = consider(idx.byPhone.get(ph), 'téléphone');
    if (res) return res;
  }
  const nk = nameKey(row.first, row.last, row.company);
  if (nk) {
    const res = consider(idx.byName.get(nk), 'nom');
    if (res) return res;
  }
  return { action: 'create' };
}
