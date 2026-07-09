import './load-env';
import { pool, withTransaction } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';

/**
 * Script utilitaire dev :
 *  - Si des utilisateurs existent sans PIN  → attribue le PIN 1234 à chacun
 *  - Si aucun utilisateur n'existe          → crée une organisation + un admin
 *    'admin@webpos.test' avec le PIN 1234
 */
async function main() {
  await withTransaction(async (client) => {
    const usersRes = await client.query<{ id: string; full_name: string; has_pin: boolean }>(
      `SELECT id, full_name, pin_code_hash IS NOT NULL AS has_pin FROM users`,
    );

    if (usersRes.rowCount && usersRes.rowCount > 0) {
      const pinHash = await hashPassword('1234');
      const noPin = usersRes.rows.filter((u) => !u.has_pin);
      if (noPin.length === 0) {
        // eslint-disable-next-line no-console
        console.log('✓ Tous les utilisateurs ont déjà un PIN.');
        // eslint-disable-next-line no-console
        console.log('Utilisateurs disponibles :');
        for (const u of usersRes.rows) {
          // eslint-disable-next-line no-console
          console.log(`  • ${u.full_name}`);
        }
        // eslint-disable-next-line no-console
        console.log('\nSi vous ne connaissez plus le PIN, relancez ce script avec --force-reset');
        return;
      }
      for (const u of noPin) {
        await client.query(
          `UPDATE users SET pin_code_hash = $1, updated_at = now() WHERE id = $2`,
          [pinHash, u.id],
        );
      }
      // eslint-disable-next-line no-console
      console.log(`✓ PIN 1234 attribué à ${noPin.length} utilisateur(s) :`);
      for (const u of noPin) {
        // eslint-disable-next-line no-console
        console.log(`  • ${u.full_name}`);
      }
      return;
    }

    // Aucun utilisateur → on crée tout ce qu'il faut
    let orgId: string;
    const orgRes = await client.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`);
    if (orgRes.rowCount === 0) {
      const orgIns = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, legal_name, address, contact)
         VALUES ('HelloPos Dev', 'HelloPos Dev',
                 '{"line1":"1 rue Test","zip":"75001","city":"Paris","country":"FR"}'::jsonb,
                 '{"email":"contact@webpos.test"}'::jsonb)
         RETURNING id`,
      );
      orgId = orgIns.rows[0]!.id;
      // Boutique + caisse minimum
      const storeIns = await client.query<{ id: string }>(
        `INSERT INTO stores (organization_id, code, name) VALUES ($1, 'DEV', 'Boutique dev') RETURNING id`,
        [orgId],
      );
      await client.query(
        `INSERT INTO registers (organization_id, store_id, code, name)
         VALUES ($1, $2, 'CAISSE-1', 'Caisse principale')`,
        [orgId, storeIns.rows[0]!.id],
      );
      // Taux TVA standards
      const taxes: Array<[string, string, number, boolean]> = [
        ['TVA20', 'TVA 20%', 20, false],
        ['TVA10', 'TVA 10% (fleurs)', 10, true],
        ['TVA55', 'TVA 5,5%', 5.5, false],
      ];
      for (const [code, label, rate, def] of taxes) {
        await client.query(
          `INSERT INTO tax_rates (organization_id, code, label, rate, is_default)
           VALUES ($1,$2,$3,$4,$5)`,
          [orgId, code, label, rate, def],
        );
      }
    } else {
      orgId = orgRes.rows[0]!.id;
    }

    const pinHash = await hashPassword('1234');
    await client.query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
       VALUES ($1, 'admin@webpos.test', $2, 'Admin HelloPos', 'owner', $2)`,
      [orgId, pinHash],
    );
    // eslint-disable-next-line no-console
    console.log('✓ Utilisateur admin créé :');
    // eslint-disable-next-line no-console
    console.log('  Email : admin@webpos.test');
    // eslint-disable-next-line no-console
    console.log('  PIN   : 1234');
    // eslint-disable-next-line no-console
    console.log('  Rôle  : Admin (owner)');
  });
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
