export const ROLES = [
  'super_admin',
  'owner',
  'manager',
  'vendeur',
  'comptable',
  'lecture_seule',
  'support_technique',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  // Caisse
  'pos.use': ['super_admin', 'owner', 'manager', 'vendeur'],
  'pos.override_price': ['super_admin', 'owner', 'manager'],
  'pos.discount_line': ['super_admin', 'owner', 'manager', 'vendeur'],
  'pos.discount_cart': ['super_admin', 'owner', 'manager'],
  'pos.refund': ['super_admin', 'owner', 'manager'],
  'pos.void_validated_sale': [], // jamais directement : passage par avoir uniquement
  // Produits
  'products.read': ['super_admin', 'owner', 'manager', 'vendeur', 'comptable', 'lecture_seule', 'support_technique'],
  'products.write': ['super_admin', 'owner', 'manager'],
  // Catégories
  'categories.write': ['super_admin', 'owner', 'manager'],
  // Stock
  'stock.adjust': ['super_admin', 'owner', 'manager'],
  // Clients
  'customers.read': ['super_admin', 'owner', 'manager', 'vendeur', 'comptable', 'lecture_seule'],
  'customers.write': ['super_admin', 'owner', 'manager', 'vendeur'],
  'customers.anonymize': ['super_admin', 'owner'],
  // Factures
  'invoices.create': ['super_admin', 'owner', 'manager', 'vendeur'],
  'invoices.validate': ['super_admin', 'owner', 'manager'],
  // Clôtures
  'closures.daily': ['super_admin', 'owner', 'manager'],
  'closures.monthly': ['super_admin', 'owner'],
  'closures.yearly': ['super_admin', 'owner'],
  // Conformité
  'fiscal.audit': ['super_admin', 'owner', 'comptable'],
  'fiscal.archive': ['super_admin', 'owner'],
  'fiscal.export': ['super_admin', 'owner', 'comptable'],
  // Utilisateurs
  'users.read': ['super_admin', 'owner'],
  'users.write': ['super_admin', 'owner'],
  // Paramètres
  'settings.read': ['super_admin', 'owner', 'manager', 'comptable'],
  'settings.write': ['super_admin', 'owner'],
} satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    const err = new Error('FORBIDDEN');
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
}
