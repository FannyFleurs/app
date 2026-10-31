// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { query, pool } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { findUsersByPin } from '@/lib/auth/pin-match';

/**
 * Connexion caisse par PIN SEUL (sans choisir de tuile au préalable) : le
 * compte est détecté à partir du code tapé. findUsersByPin() est le cœur de
 * cette détection — extrait de la route pin-login-auto car cette dernière
 * dépend de cookies()/headers() (indisponibles hors contexte de requête
 * Next.js, donc non testable directement ici).
 *
 * Même périmètre que /api/users/select : organisation + boutique du poste
 * le cas échéant (rôles de gestion toujours éligibles partout, un
 * utilisateur sans rattachement explicite aussi).
 *
 * Intégration contre une VRAIE base Postgres.
 */
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('findUsersByPin — détection de compte par PIN seul', () => {
  let organizationId: string;
  let storeAId: string;
  let storeBId: string;

  async function makeUser(opts: {
    pin: string | null; role?: string; storeId?: string | null;
    active?: boolean; service?: boolean; locked?: boolean;
  }): Promise<string> {
    const hash = opts.pin ? await hashPassword(opts.pin) : null;
    const u = await query<{ id: string }>(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role,
         pin_code_hash, pin_required, is_active, is_service, locked_until)
       VALUES ($1,$2,'x',$3,$4,$5,TRUE,$6,$7,$8) RETURNING id`,
      [
        organizationId, `pma-${randomUUID()}@example.test`, 'Testeur PIN', opts.role ?? 'vendeur',
        hash, opts.active ?? true, opts.service ?? false,
        opts.locked ? new Date(Date.now() + 60_000).toISOString() : null,
      ],
    );
    const userId = u.rows[0]!.id;
    if (opts.storeId) {
      await query(
        `INSERT INTO user_store_access (user_id, store_id) VALUES ($1,$2)`,
        [userId, opts.storeId],
      );
    }
    return userId;
  }

  beforeAll(async () => {
    const org = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pin Auto ${randomUUID()}`],
    );
    organizationId = org.rows[0]!.id;
    const storeA = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [organizationId],
    );
    storeAId = storeA.rows[0]!.id;
    const storeB = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [organizationId],
    );
    storeBId = storeB.rows[0]!.id;
  });

  afterAll(async () => { await pool.end(); });

  it('trouve le compte unique dont le PIN correspond, sans boutique (toute l\'organisation)', async () => {
    const userId = await makeUser({ pin: '4821' });
    const matches = await findUsersByPin(organizationId, null, '4821');
    expect(matches.map((m) => m.id)).toEqual([userId]);
  });

  it('aucun résultat si le PIN ne correspond à aucun compte', async () => {
    await makeUser({ pin: '1111' });
    const matches = await findUsersByPin(organizationId, null, '9999');
    expect(matches).toEqual([]);
  });

  it('plusieurs comptes partageant le même PIN : tous remontés (l\'appelant doit refuser de deviner)', async () => {
    const org2 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pin Auto Ambiguous ${randomUUID()}`],
    );
    const org2Id = org2.rows[0]!.id;
    const prevOrg = organizationId;
    organizationId = org2Id; // réutilise makeUser() pour cette organisation isolée
    const u1 = await makeUser({ pin: '7777' });
    const u2 = await makeUser({ pin: '7777' });
    organizationId = prevOrg;

    const matches = await findUsersByPin(org2Id, null, '7777');
    expect(matches.map((m) => m.id).sort()).toEqual([u1, u2].sort());
  });

  it('filtre par boutique du poste : un compte rattaché à une AUTRE boutique n\'est pas proposé', async () => {
    const org3 = await query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $1) RETURNING id`,
      [`Test Pin Auto Store Scope ${randomUUID()}`],
    );
    const org3Id = org3.rows[0]!.id;
    const prevOrg = organizationId;
    organizationId = org3Id;
    const storeA3 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'A', 'Boutique A') RETURNING id`,
      [org3Id],
    );
    const storeB3 = await query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'B', 'Boutique B') RETURNING id`,
      [org3Id],
    );
    const vendeurA = await makeUser({ pin: '2468', role: 'vendeur', storeId: storeA3.rows[0]!.id });
    await makeUser({ pin: '2468', role: 'vendeur', storeId: storeB3.rows[0]!.id }); // même PIN, AUTRE boutique
    organizationId = prevOrg;

    const matches = await findUsersByPin(org3Id, storeA3.rows[0]!.id, '2468');
    expect(matches.map((m) => m.id)).toEqual([vendeurA]);
  });

  it('un manager reste éligible sur toutes les boutiques même sans rattachement explicite', async () => {
    const managerId = await makeUser({ pin: '3141', role: 'manager' });
    const matches = await findUsersByPin(organizationId, storeAId, '3141');
    expect(matches.map((m) => m.id)).toEqual([managerId]);
  });

  it('un compte sans aucun rattachement de boutique reste éligible partout (rétrocompat)', async () => {
    const userId = await makeUser({ pin: '9630', role: 'vendeur' }); // pas de storeId
    const matches = await findUsersByPin(organizationId, storeBId, '9630');
    expect(matches.map((m) => m.id)).toEqual([userId]);
  });

  it('ignore un compte inactif, un compte de service, ou sans PIN configuré', async () => {
    await makeUser({ pin: '5555', active: false });
    await makeUser({ pin: '6666', service: true });
    await makeUser({ pin: null }); // pas de PIN du tout
    expect(await findUsersByPin(organizationId, null, '5555')).toEqual([]);
    expect(await findUsersByPin(organizationId, null, '6666')).toEqual([]);
  });

  it('ignore un compte actuellement verrouillé (échecs répétés sur le flux manuel)', async () => {
    await makeUser({ pin: '8642', locked: true });
    expect(await findUsersByPin(organizationId, null, '8642')).toEqual([]);
  });
});
