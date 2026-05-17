import { describe, it, expect } from 'vitest';
import { hasPermission, PERMISSIONS } from '../lib/auth/rbac';

describe('RBAC', () => {
  it('vendeur peut utiliser la caisse mais pas modifier les prix produit', () => {
    expect(hasPermission('vendeur', 'pos.use')).toBe(true);
    expect(hasPermission('vendeur', 'pos.override_price')).toBe(false);
    expect(hasPermission('vendeur', 'products.write')).toBe(false);
  });
  it('comptable a accès lecture seule au CRM mais pas à la caisse', () => {
    expect(hasPermission('comptable', 'customers.read')).toBe(true);
    expect(hasPermission('comptable', 'pos.use')).toBe(false);
  });
  it('aucun rôle ne peut supprimer une vente validée', () => {
    expect(PERMISSIONS['pos.void_validated_sale']).toEqual([]);
  });
  it('lecture_seule ne peut rien écrire', () => {
    expect(hasPermission('lecture_seule', 'products.write')).toBe(false);
    expect(hasPermission('lecture_seule', 'customers.write')).toBe(false);
    expect(hasPermission('lecture_seule', 'closures.daily')).toBe(false);
  });
});
