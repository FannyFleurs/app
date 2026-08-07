/**
 * Formats proposés dans « Exports comptables ».
 *
 * Un seul sert au quotidien : la ventilation par compte, celle que le
 * comptable saisit. Les autres répondent à des besoins ponctuels — vérifier
 * un ticket, réimporter des données — ou traînent depuis les débuts du
 * produit. Les proposer tous les cinq côte à côte oblige à choisir entre des
 * fichiers dont on ignore ce qu'ils contiennent.
 *
 * Ils restent donc disponibles, mais sur décision : le commerçant les active
 * dans Paramètres → Formats d'export, et l'écran d'export n'affiche que le
 * format de base tant qu'il ne l'a pas fait.
 */

export const EXPORT_FORMATS_KEY = 'accounting_export_formats';

export interface ExportFormatMeta {
  value: string;
  label: string;
  /** Ce que contient le fichier, en une phrase. */
  description: string;
  /** Réserve éventuelle à énoncer avant de s'en servir. */
  caveat?: string;
}

/** Toujours proposé : c'est l'export de référence. */
export const CORE_FORMAT: ExportFormatMeta = {
  value: 'accounts_csv',
  label: 'Ventes par compte — CSV',
  description:
    'La ventilation par compte comptable : le HT de chaque famille × taux × boutique, '
    + 'puis la TVA collectée et les totaux. C’est ce que saisit votre comptable.',
};

/** Facultatifs : masqués tant qu’ils ne sont pas activés. */
export const OPTIONAL_FORMATS: ExportFormatMeta[] = [
  {
    value: 'sales_csv',
    label: 'Ventes — CSV',
    description:
      'Une ligne par ticket : numéro, date, vendeur, client, HT, TVA, remises, TTC. '
      + 'Le détail brut, utile pour justifier ou vérifier une journée.',
  },
  {
    value: 'entries_csv',
    label: 'Écritures comptables — CSV',
    description:
      'Des écritures agrégées par jour : ventes et TVA au crédit, caisse et banque au débit.',
    caveat:
      'Met toute la TVA sur le compte 20 % quel que soit le taux, et ne connaît que '
      + 'les règlements espèces et carte — les autres manquent au débit.',
  },
  {
    value: 'fec_like',
    label: 'FEC-like (informatif)',
    description:
      'Une écriture par ticket, à la mise en forme du Fichier des Écritures Comptables.',
    caveat:
      'Ce n’est pas un FEC légal et il ne remplace pas celui de votre comptable ; '
      + 'il porte tous les encaissements en caisse et la TVA à 20 %.',
  },
  {
    value: 'json',
    label: 'JSON détaillé',
    description:
      'Le contenu brut des ventes, destiné à un programme qui les réimporte ailleurs.',
  },
];

export const ALL_FORMATS: ExportFormatMeta[] = [CORE_FORMAT, ...OPTIONAL_FORMATS];

/**
 * Formats facultatifs activés, à partir de la valeur stockée.
 * Tolère l'absence de réglage (aucun activé) et ignore les valeurs inconnues —
 * un format retiré du produit ne doit pas ressusciter par un vieux réglage.
 */
export function enabledOptionalFormats(value: unknown): string[] {
  const raw = (value as { optional?: unknown } | null)?.optional;
  if (!Array.isArray(raw)) return [];
  const known = new Set(OPTIONAL_FORMATS.map((f) => f.value));
  return raw.filter((v): v is string => typeof v === 'string' && known.has(v));
}

/** Formats réellement proposés à l'export, dans l'ordre d'affichage. */
export function availableFormats(value: unknown): ExportFormatMeta[] {
  const on = new Set(enabledOptionalFormats(value));
  return [CORE_FORMAT, ...OPTIONAL_FORMATS.filter((f) => on.has(f.value))];
}
