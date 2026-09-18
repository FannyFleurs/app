import type { RawRevenueRow } from './revenue-history-parse';

export interface ValidatedRevenueRow {
  line: number;
  day: string;            // yyyy-mm-dd si valide, sinon la valeur brute
  store: string;          // nom tel qu'écrit dans le fichier
  store_id: string | null;
  ca_ttc: number | null;
  ca_ht: number | null;
  tickets: number | null;
  errors: string[];
  warnings: string[];
}

/** Nom de boutique normalisé pour l'appariement (casse / accents / espaces). */
export function normStoreName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(iso: string): boolean {
  if (!ISO_RE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

/**
 * Valide les lignes d'un import d'historique de CA et résout la boutique par
 * nom. `storesByName` : nom normalisé -> id. `today` : borne « pas dans le
 * futur » (ISO). La déduplication porte sur (boutique, jour) DANS le fichier.
 */
export function validateRevenueRows(
  raw: RawRevenueRow[],
  storesByName: Map<string, string>,
  today: string,
): ValidatedRevenueRow[] {
  // Repérage des doublons (même boutique, même jour) dans le fichier.
  const seen = new Map<string, number[]>();
  raw.forEach((r, idx) => {
    const key = `${normStoreName(r.store)}|${r.day}`;
    const arr = seen.get(key) ?? [];
    arr.push(idx);
    seen.set(key, arr);
  });

  return raw.map((r, idx) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!r.day || !isRealDate(r.day)) {
      errors.push('Date invalide (attendu jj/mm/aaaa ou aaaa-mm-jj)');
    } else if (r.day > today) {
      errors.push('Date dans le futur');
    }

    const storeId = r.store ? (storesByName.get(normStoreName(r.store)) ?? null) : null;
    if (!r.store?.trim()) errors.push('Boutique obligatoire');
    else if (!storeId) errors.push(`Boutique inconnue : « ${r.store} »`);

    if (r.ca_ttc == null || Number.isNaN(r.ca_ttc)) errors.push('CA TTC invalide');
    else if (r.ca_ttc < 0) errors.push('CA TTC négatif');

    if (r.ca_ht != null && Number.isNaN(r.ca_ht)) errors.push('CA HT invalide');
    else if (r.ca_ht != null && r.ca_ht < 0) errors.push('CA HT négatif');
    else if (r.ca_ht != null && r.ca_ttc != null && !Number.isNaN(r.ca_ttc) && r.ca_ht > r.ca_ttc + 0.01) {
      warnings.push('CA HT supérieur au CA TTC');
    }

    if (r.tickets != null && (Number.isNaN(r.tickets) || r.tickets < 0)) {
      errors.push('Nombre de tickets invalide');
    }

    const key = `${normStoreName(r.store)}|${r.day}`;
    if ((seen.get(key)?.length ?? 0) > 1) {
      errors.push('Doublon (même boutique, même jour) dans le fichier');
    }

    return {
      line: idx + 2, // +1 index, +1 ligne d'entêtes
      day: r.day,
      store: r.store,
      store_id: storeId,
      ca_ttc: r.ca_ttc,
      ca_ht: r.ca_ht,
      tickets: r.tickets,
      errors,
      warnings,
    };
  });
}
