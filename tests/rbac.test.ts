import { describe, it, expect } from 'vitest';
import { hasPermission, PERMISSIONS } from '../lib/auth/rbac';

describe('RBAC', () => {
  it('vendeur peut utiliser la caisse mais pas modifier les prix produit', () => {
    expect(hasPermission('vendeur', 'pos.use')).toBe(true);
    expect(hasPermission('vendeur', 'pos.override_price')).toBe(false);
    expect(hasPermission('vendeur', 'products.write')).toBe(false);
  });
  it('comptable : la comptabilité, et rien d\'autre', () => {
    // Intervenant EXTERNE, connecté à distance au back-office. Il lui faut de
    // quoi exporter et vérifier le plan de comptes — pas le fichier clients,
    // pas le catalogue, pas les réglages de la boutique.
    expect(hasPermission('comptable', 'fiscal.export')).toBe(true);
    expect(hasPermission('comptable', 'accounting.read')).toBe(true);
    // Il RENSEIGNE lui-même son plan de comptes : c'est lui qui connaît les
    // numéros, et passer par le commerçant à chaque famille n'aurait aucun sens.
    expect(hasPermission('comptable', 'accounting.write')).toBe(true);
    expect(hasPermission('comptable', 'fiscal.audit')).toBe(true);

    expect(hasPermission('comptable', 'pos.use')).toBe(false);
    expect(hasPermission('comptable', 'customers.read')).toBe(false);
    expect(hasPermission('comptable', 'products.read')).toBe(false);
    expect(hasPermission('comptable', 'settings.read')).toBe(false);
    expect(hasPermission('comptable', 'settings.write')).toBe(false);
  });

  it('toute entrée de navigation porte une permission', async () => {
    // Une entrée sans permission est visible de TOUS les rôles : c'est ainsi
    // que Stock et Factures apparaissaient au comptable externe.
    const { SIDEBAR_ITEMS } = await import('@/components/Sidebar');
    const sans = SIDEBAR_ITEMS.filter((i) => !i.perm).map((i) => i.href);
    expect(sans).toEqual([]);
  });
  it('aucun rôle ne peut supprimer une vente validée', () => {
    expect(PERMISSIONS['pos.void_validated_sale']).toEqual([]);
  });
  it('lecture_seule ne peut rien écrire', () => {
    expect(hasPermission('lecture_seule', 'products.write')).toBe(false);
    expect(hasPermission('lecture_seule', 'customers.write')).toBe(false);
    expect(hasPermission('lecture_seule', 'closures.daily')).toBe(false);
  });

  it('poste itinérant (pos.roaming_device) réservé par défaut à Admin (owner) et super_admin', () => {
    expect(hasPermission('owner', 'pos.roaming_device')).toBe(true);
    expect(hasPermission('super_admin', 'pos.roaming_device')).toBe(true);
    // Ni le responsable ni les autres rôles ne l'ont par défaut — un
    // owner peut l'accorder à un rôle précis depuis Paramètres → Permissions
    // par rôle, mais ça ne doit jamais être le comportement de base.
    expect(hasPermission('manager', 'pos.roaming_device')).toBe(false);
    expect(hasPermission('vendeur', 'pos.roaming_device')).toBe(false);
    expect(hasPermission('comptable', 'pos.roaming_device')).toBe(false);
    expect(hasPermission('lecture_seule', 'pos.roaming_device')).toBe(false);
    expect(hasPermission('support_technique', 'pos.roaming_device')).toBe(false);
  });
});
