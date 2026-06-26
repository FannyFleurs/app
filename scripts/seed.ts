import './load-env';
import { pool, withTransaction } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';
import { runMigrations } from '../lib/db/migrate';

const FLORIST_PRODUCTS = [
  // [name, category, prix TTC, tva code, tags, customizable, free, seasonal]
  ['Bouquet rond du jour', 'Bouquets', 28.00, 'TVA10', ['fleurs','frais'], false, false, false],
  ['Bouquet champêtre', 'Bouquets', 35.00, 'TVA10', ['fleurs'], false, false, false],
  ['Bouquet de saison', 'Bouquets', 42.00, 'TVA10', ['fleurs','saison'], true, false, true],
  ['Bouquet personnalisé', 'Bouquets', 0, 'TVA10', ['fleurs','sur-mesure'], true, true, false],
  ['Composition florale piquée', 'Compositions', 55.00, 'TVA10', ['composition'], true, false, false],
  ['Centre de table', 'Compositions', 65.00, 'TVA10', ['composition','table'], true, false, false],
  ['Orchidée blanche', 'Plantes vertes', 32.00, 'TVA10', ['plante','orchidée'], false, false, false],
  ['Monstera Deliciosa', 'Plantes vertes', 38.00, 'TVA10', ['plante','tropicale'], false, false, false],
  ['Pilea Peperomioides', 'Plantes vertes', 18.00, 'TVA10', ['plante','déco'], false, false, false],
  ['Cache-pot terre cuite Ø14', 'Cache-pots', 12.50, 'TVA20', ['déco','pot'], false, false, false],
  ['Cache-pot émaillé Ø17 vert sauge', 'Cache-pots', 24.00, 'TVA20', ['déco','pot'], false, false, false],
  ['Bougie parfumée figuier', 'Bougies', 22.00, 'TVA20', ['déco','bougie'], false, false, false],
  ['Bougie soja vanille', 'Bougies', 18.00, 'TVA20', ['déco','bougie'], false, false, false],
  ['Carte cadeau', 'Carte cadeau', 0, 'TVA20', ['cadeau'], false, true, false],
  ['Carte message', 'Décoration', 3.50, 'TVA20', ['carte'], false, false, false],
  ['Ruban deuil personnalisé', 'Décoration', 8.00, 'TVA20', ['deuil'], true, false, false],
  ['Frais de livraison Paris', 'Services', 12.00, 'TVA20', ['livraison'], false, false, false],
  ['Frais de préparation express', 'Services', 5.00, 'TVA20', ['service'], false, false, false],
  ['Composition Saint-Valentin', 'Compositions', 75.00, 'TVA10', ['saison','valentin'], false, false, true],
  ['Chrysanthème Toussaint', 'Plantes vertes', 25.00, 'TVA10', ['saison','toussaint'], false, false, true],
] as const;

async function main() {
  await runMigrations();

  await withTransaction(async (client) => {
    // Organisation
    const orgRes = await client.query<{ id: string }>(
      `INSERT INTO organizations (name, legal_name, siret, vat_number, address, contact)
       VALUES ('Atelier Sauge', 'Atelier Sauge SARL', '12345678900012', 'FR12123456789',
        '{"line1":"12 rue des Fleurs","zip":"75011","city":"Paris","country":"FR"}'::jsonb,
        '{"phone":"01 23 45 67 89","email":"contact@ateliersauge.fr"}'::jsonb)
       RETURNING id`,
    );
    const orgId = orgRes.rows[0]!.id;

    // Boutique + caisse
    const storeRes = await client.query<{ id: string }>(
      `INSERT INTO stores (organization_id, code, name,
         address)
       VALUES ($1, 'PARIS-11', 'Boutique Paris XIe',
        '{"line1":"12 rue des Fleurs","zip":"75011","city":"Paris"}'::jsonb)
       RETURNING id`,
      [orgId],
    );
    const storeId = storeRes.rows[0]!.id;
    const regRes = await client.query<{ id: string }>(
      `INSERT INTO registers (organization_id, store_id, code, name)
       VALUES ($1, $2, 'CAISSE-1', 'Caisse principale') RETURNING id`,
      [orgId, storeId],
    );
    const registerId = regRes.rows[0]!.id;

    // Taux TVA
    const taxes: Record<string, string> = {};
    for (const [code, label, rate, def] of [
      ['TVA20', 'TVA standard 20%', 20.0, false],
      ['TVA10', 'TVA fleurs / plantes 10%', 10.0, true],
      ['TVA55', 'TVA réduite 5.5%', 5.5, false],
      ['TVA00', 'Exonéré', 0.0, false],
    ] as const) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [orgId, code, label, rate, def],
      );
      taxes[code] = r.rows[0]!.id;
    }

    // Utilisateurs
    const pwd = await hashPassword('Florea2026!');
    // PIN par défaut "1234" pour tous les comptes seedés
    const pinHash = await hashPassword('1234');
    const users: Array<[string, string, string]> = [
      ['owner@florea.test', 'Camille Dupont', 'owner'],
      ['manager@florea.test', 'Léa Martin', 'manager'],
      ['vendeur@florea.test', 'Mathieu Rivière', 'vendeur'],
      ['comptable@florea.test', 'Aïcha Bensaïd', 'comptable'],
    ];
    const userIds: Record<string, string> = {};
    for (const [email, name, role] of users) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [orgId, email, pwd, name, role, pinHash],
      );
      userIds[email] = r.rows[0]!.id;
    }

    // Accès boutique pour le vendeur
    await client.query(
      `INSERT INTO user_store_access (user_id, store_id) VALUES ($1,$2)`,
      [userIds['vendeur@florea.test'], storeId],
    );

    // Catégories
    const cats = ['Bouquets', 'Compositions', 'Plantes vertes', 'Cache-pots',
                  'Bougies', 'Décoration', 'Services', 'Carte cadeau'];
    const colors = ['#E8EFE2','#EFE6D6','#D8E8D8','#EFE6D6','#F0E4D7','#E6E2D8','#E0DBCF','#F3E8E0'];
    const catIds: Record<string, string> = {};
    for (let i = 0; i < cats.length; i++) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO product_categories (organization_id, name, color, position)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [orgId, cats[i], colors[i], i],
      );
      catIds[cats[i]!] = r.rows[0]!.id;
    }

    // Produits
    for (const [name, cat, price, taxCode, tags, custom, freeP, seasonal] of FLORIST_PRODUCTS) {
      await client.query(
        `INSERT INTO products
          (organization_id, name, category_id, sku, tax_rate_id, sale_price_ttc,
           price_is_free, is_customizable, is_seasonal, visible_in_pos, is_active, tags, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,$10,'unité')`,
        [
          orgId, name, catIds[cat] ?? null, slugify(name as string).slice(0, 24),
          taxes[taxCode as string], price, freeP, custom, seasonal, tags,
        ],
      );
    }

    // eslint-disable-next-line no-console
    console.log('✓ Seed terminé');
    console.log('Comptes (mot de passe : Florea2026!) :');
    for (const [email] of users) console.log('  •', email);
  });

  await pool.end();
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
