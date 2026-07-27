/**
 * Colonnes du modèle d'import clients (partagé entre l'export du modèle Excel
 * et le parseur d'import, pour rester synchronisés).
 * L'ordre définit l'ordre des colonnes dans le fichier.
 */
export interface ImportColumn {
  key: string;
  header: string;
  width: number;
  example: string | number;
}

export const CUSTOMER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'type', header: 'Type', width: 16, example: 'particulier' },
  { key: 'first_name', header: 'Prénom', width: 18, example: 'Marie' },
  { key: 'last_name', header: 'Nom', width: 18, example: 'Dupont' },
  { key: 'company_name', header: 'Société', width: 22, example: '' },
  { key: 'email', header: 'Email', width: 26, example: 'marie.dupont@email.fr' },
  { key: 'phone', header: 'Téléphone', width: 16, example: '0612345678' },
  { key: 'siret', header: 'SIRET', width: 18, example: '' },
  { key: 'vat_number', header: 'N° TVA', width: 16, example: '' },
  { key: 'line1', header: 'Adresse', width: 28, example: '12 rue des Fleurs' },
  { key: 'zip', header: 'Code postal', width: 12, example: '61000' },
  { key: 'city', header: 'Ville', width: 18, example: 'Alençon' },
  { key: 'consent_email', header: 'Consentement email (oui/non)', width: 26, example: 'oui' },
  { key: 'consent_sms', header: 'Consentement SMS (oui/non)', width: 26, example: 'non' },
  { key: 'internal_notes', header: 'Notes', width: 24, example: '' },
  { key: 'loyalty_code', header: 'Code fidélité', width: 16, example: '' },
  { key: 'loyalty_points', header: 'Points fidélité', width: 16, example: 120 },
];

export const CUSTOMER_TYPES = ['particulier', 'professionnel', 'collectivite', 'association'] as const;

/** Interprète une case « oui / non » (tolérant : oui, o, yes, 1, true, x). */
export function parseBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase();
  return ['oui', 'o', 'yes', 'y', '1', 'true', 'vrai', 'x'].includes(s);
}
