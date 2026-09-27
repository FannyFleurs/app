import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';

/**
 * Route /api/settings/stripe — l'API réellement appelée par la section
 * Stripe de /settings/payment-methods (voir PaymentMethodsForm.tsx).
 *
 * Intégration contre une VRAIE base Postgres (comme
 * tests/multi-store-stripe-integration.test.ts) : vérifie que le sélecteur
 * de boutique de l'UI, une fois branché sur `store_id`, écrit bien sous la
 * clé scoped ATTENDUE (`stripe:<storeId>`) et jamais sous la clé
 * organisation par accident, que le secret masqué n'est jamais réenregistré
 * comme valeur réelle, et que les gardes d'accès (permission, appartenance
 * de la boutique à l'organisation) sont bien appliquées.
 */
const hasDb = !!process.env.DATABASE_URL;

// `requirePermission` s'appuie sur `hasEffectivePermission`, qui utilise
// `cache()` de React (API RSC canary, indisponible sous Node/Vitest nu —
// d'où ce mock plutôt qu'une résolution RBAC réelle, non spécifique à
// Stripe et hors du périmètre de ce test). `currentPermissionResult` pilote
// le comportement par test : soit un utilisateur autorisé, soit un refus
// 403 identique à celui que `requirePermission` renverrait réellement.
let currentUser: { id: string; organizationId: string; email: string; fullName: string; role: string };
let currentAllowed = true;
vi.mock('@/lib/auth/guards', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requirePermission: async () => {
      if (!currentAllowed) {
        return { response: NextResponse.json({ error: 'FORBIDDEN', permission: 'settings.write' }, { status: 403 }) };
      }
      return { user: currentUser };
    },
  };
});

const { GET, PATCH } = await import('@/app/api/settings/stripe/route');

describe.skipIf(!hasDb)('GET/PATCH /api/settings/stripe — intégration DB', () => {
  let organizationId: string;
  let otherOrganizationId: string;
  let storeFfId: string;
  let storePvId: string;
  let ownerUserId: string;
  let vendeurUserId: string;

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Route Stripe ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;

    const otherOrg = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Autre Org ${randomUUID()}`],
    );
    otherOrganizationId = otherOrg.rows[0]!.id;

    const storeFf = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'FF', 'Fanny Fleurs') RETURNING id`,
      [organizationId],
    );
    storeFfId = storeFf.rows[0]!.id;
    const storePv = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'PV', 'Plante Verte') RETURNING id`,
      [organizationId],
    );
    storePvId = storePv.rows[0]!.id;

    const owner = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Propriétaire', 'owner') RETURNING id`,
      [organizationId, `owner-${randomUUID()}@example.test`],
    );
    ownerUserId = owner.rows[0]!.id;
    const vendeur = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role)
       VALUES ($1, $2, 'x', 'Vendeur', 'vendeur') RETURNING id`,
      [organizationId, `vendeur-${randomUUID()}@example.test`],
    );
    vendeurUserId = vendeur.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function asOwner() {
    currentUser = { id: ownerUserId, organizationId, email: 'owner@test', fullName: 'Propriétaire', role: 'owner' };
    currentAllowed = true;
  }
  function asVendeur() {
    currentUser = { id: vendeurUserId, organizationId, email: 'vendeur@test', fullName: 'Vendeur', role: 'vendeur' };
    currentAllowed = false; // ni settings.read ni settings.write pour ce rôle
  }

  function req(url: string, init?: RequestInit) {
    return new Request(`https://x.test${url}`, init);
  }

  it("PATCH avec store_id=Fanny Fleurs écrit sous stripe:<storeId FF>, jamais sous la clé organisation", async () => {
    asOwner();
    const res = await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeFfId, enabled: true, publishable_key: 'pk_test_ff',
        secret_key: 'sk_test_ff_value', webhook_secret: 'whsec_ff_value', return_url: '',
      }),
    }));
    expect(res.status).toBe(200);

    const scoped = await query<{ value: { secret_key: string } }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [organizationId, `stripe:${storeFfId}`],
    );
    expect(scoped.rows).toHaveLength(1);

    // Aucune écriture accidentelle sous la clé organisation (`stripe` seule).
    const orgLevel = await query<{ n: string }>(
      `SELECT COUNT(*)::text n FROM settings WHERE organization_id = $1 AND key = 'stripe'`,
      [organizationId],
    );
    expect(orgLevel.rows[0]!.n).toBe('0');
  });

  it("PATCH avec store_id=Plante Verte écrit sous stripe:<storeId PV>, indépendant de Fanny Fleurs", async () => {
    asOwner();
    await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storePvId, enabled: true, publishable_key: 'pk_test_pv',
        secret_key: 'sk_test_pv_value', webhook_secret: 'whsec_pv_value', return_url: '',
      }),
    }));

    const resFf = await GET(req(`/api/settings/stripe?store_id=${storeFfId}`));
    const resPv = await GET(req(`/api/settings/stripe?store_id=${storePvId}`));
    const jFf = await resFf.json();
    const jPv = await resPv.json();

    expect(jFf.settings.publishable_key).toBe('pk_test_ff');
    expect(jPv.settings.publishable_key).toBe('pk_test_pv');
    expect(jFf.inherited).toBe(false);
    expect(jPv.inherited).toBe(false);
    // Jamais le secret complet renvoyé au navigateur.
    expect(jFf.settings.secret_key).toBeUndefined();
    expect(jFf.settings.secret_key_set).toBe(true);
  });

  it("changer de boutique recharge la config de CETTE boutique (jamais un mélange)", async () => {
    asOwner();
    const resFf = await GET(req(`/api/settings/stripe?store_id=${storeFfId}`));
    const resPv = await GET(req(`/api/settings/stripe?store_id=${storePvId}`));
    const jFf = await resFf.json();
    const jPv = await resPv.json();
    // Comparaison sur la valeur RÉELLE (déchiffrée), pas le masque affiché —
    // deux secrets de préfixe/suffixe identiques produiraient le même masque
    // sans pour autant être mélangés en base.
    const { loadStripeSettings } = await import('@/lib/settings/stripe-server');
    const realFf = await loadStripeSettings(organizationId, storeFfId);
    const realPv = await loadStripeSettings(organizationId, storePvId);
    expect(jFf.settings.publishable_key).toBe('pk_test_ff');
    expect(jPv.settings.publishable_key).toBe('pk_test_pv');
    expect(realFf.settings.secret_key).toBe('sk_test_ff_value');
    expect(realPv.settings.secret_key).toBe('sk_test_pv_value');
    expect(realFf.settings.secret_key).not.toBe(realPv.settings.secret_key);
  });

  it("une boutique sans configuration propre affiche un fallback organisation identifié (inherited=true)", async () => {
    asOwner();
    // Configuration ORGANISATION distincte des deux boutiques ci-dessus.
    await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, publishable_key: 'pk_test_org', secret_key: 'sk_test_org_value', webhook_secret: 'whsec_org_value', return_url: '' }),
    }));

    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'NEW', 'Nouvelle Boutique') RETURNING id`,
      [organizationId],
    );
    const res = await GET(req(`/api/settings/stripe?store_id=${store.rows[0]!.id}`));
    const j = await res.json();
    expect(j.inherited).toBe(true);
    expect(j.settings.publishable_key).toBe('pk_test_org');
  });

  it("un secret non modifié (champ vide envoyé) n'écrase JAMAIS le vrai secret par une valeur masquée ou vide", async () => {
    asOwner();
    const store = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'MASK', 'Boutique Masque') RETURNING id`,
      [organizationId],
    );
    const storeId = store.rows[0]!.id;
    await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, enabled: true, publishable_key: 'pk_test_mask', secret_key: 'sk_test_real_secret', webhook_secret: 'whsec_real_secret', return_url: '' }),
    }));
    // Ré-enregistrement SANS toucher aux secrets (champs absents/vides, comme
    // le fait le formulaire quand l'utilisateur ne retape rien) : ne doit
    // jamais remplacer le secret réel par une chaîne vide ou un masque.
    await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, enabled: true, publishable_key: 'pk_test_mask_updated', return_url: '' }),
    }));

    const raw = await query<{ value: { secret_key: string; publishable_key: string } }>(
      `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
      [organizationId, `stripe:${storeId}`],
    );
    // publishable_key a bien été mis à jour (démontre que le 2e PATCH a agi),
    // mais le secret réel (déchiffré) reste inchangé.
    expect(raw.rows[0]!.value.publishable_key).toBe('pk_test_mask_updated');

    const { loadStripeSettings } = await import('@/lib/settings/stripe-server');
    const loaded = await loadStripeSettings(organizationId, storeId);
    expect(loaded.settings.secret_key).toBe('sk_test_real_secret');
    expect(loaded.settings.webhook_secret).toBe('whsec_real_secret');
  });

  it("une boutique d'une AUTRE organisation est refusée (404), quel que soit le rôle de l'appelant", async () => {
    asOwner();
    const foreignStore = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'X', 'Boutique étrangère') RETURNING id`,
      [otherOrganizationId],
    );
    const res = await GET(req(`/api/settings/stripe?store_id=${foreignStore.rows[0]!.id}`));
    expect(res.status).toBe(404);
    const j = await res.json();
    expect(j.error).toBe('STORE_NOT_FOUND');
  });

  it("un utilisateur sans la permission settings.write (ex. vendeur) ne peut pas configurer Stripe, pour aucune boutique", async () => {
    asVendeur();
    const resGet = await GET(req(`/api/settings/stripe?store_id=${storeFfId}`));
    expect(resGet.status).toBe(403);
    const resPatch = await PATCH(req(`/api/settings/stripe`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeFfId, enabled: true, secret_key: 'sk_should_never_be_written' }),
    }));
    expect(resPatch.status).toBe(403);

    // Confirme qu'aucune écriture n'a eu lieu malgré la tentative.
    asOwner();
    const { loadStripeSettings } = await import('@/lib/settings/stripe-server');
    const loaded = await loadStripeSettings(organizationId, storeFfId);
    expect(loaded.settings.secret_key).not.toBe('sk_should_never_be_written');
  });
});
