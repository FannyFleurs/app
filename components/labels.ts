import type { Role } from '@/lib/auth/rbac';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  owner: 'Propriétaire',
  manager: 'Manager',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
  lecture_seule: 'Lecture seule',
  support_technique: 'Support',
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  gift_card: 'Carte cadeau',
  credit_note: 'Avoir',
  deferred: 'Différé client',
  other: 'Autre',
};
