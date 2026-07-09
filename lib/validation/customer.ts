import { z } from 'zod';

/**
 * Schéma de saisie d'un client, partagé client/serveur.
 * Les particuliers utilisent first/last_name, les professionnels
 * (et collectivités/associations) utilisent company_name.
 */
export const customerInputSchema = z.object({
  type: z.enum(['particulier', 'professionnel', 'collectivite', 'association']),
  first_name: z.string().max(80).nullable().optional(),
  last_name: z.string().max(80).nullable().optional(),
  company_name: z.string().max(160).nullable().optional(),
  email: z.string().email().max(160).nullable().optional().or(z.literal('')),
  phone: z.string().max(40).nullable().optional(),
  siret: z.string().max(20).nullable().optional(),
  // SIREN (9 chiffres) — racine entreprise, exigé par certains formats.
  siren: z.string().max(15).nullable().optional(),
  vat_number: z.string().max(40).nullable().optional(),
  // Chorus Pro (secteur public / B2G).
  public_service_code: z.string().max(60).nullable().optional(),
  commitment_number: z.string().max(60).nullable().optional(),
  address: z.object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    zip: z.string().max(20).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(60).optional(),
  }).optional(),
  consent_email: z.boolean().optional(),
  consent_sms: z.boolean().optional(),
  internal_notes: z.string().max(2000).nullable().optional(),
  loyalty_code: z.string().max(60).nullable().optional(),
  default_discount_pct: z.number().min(0).max(100).nullable().optional(),
}).refine(
  (d) => d.type === 'particulier'
    ? !!(d.first_name || d.last_name)
    : !!d.company_name,
  { message: 'Indiquez un nom complet (particulier) ou une raison sociale (pro/asso).' },
);

export type CustomerInput = z.infer<typeof customerInputSchema>;
