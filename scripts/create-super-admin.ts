import './load-env';
import { pool, withTransaction } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';
import { randomBytes } from 'node:crypto';

/**
 * Crée (ou promeut) un compte super_admin pour le gestionnaire de la
 * plateforme Webpos POS SaaS.
 *
 * Le super_admin a un accès cross-tenant à la console /admin (liste des
 * organisations, abonnements, paiements, octroi de périodes offertes…).
 * Il n'a PAS besoin d'avoir une "vraie" boutique. On le rattache à une
 * organisation technique "Webpos Platform" créée si nécessaire.
 *
 * Usage :
 *   npm run create:super-admin <email> [mot_de_passe]
 *
 * Exemples :
 *   npm run create:super-admin contact@swebio.fr
 *     → mot de passe et PIN générés automatiquement et affichés.
 *   npm run create:super-admin contact@swebio.fr MonMotDePasse!23
 *     → utilise le mot de passe fourni.
 *
 * Comportement :
 *   - Si l'email existe déjà → on promeut au rôle super_admin (no-op s'il
 *     l'est déjà). Le mot de passe n'est pas réécrit.
 *   - Sinon → on crée :
 *       1. l'organisation technique "Webpos Platform" (slug platform), si
 *          elle n'existe pas encore ;
 *       2. l'utilisateur, role=super_admin, avec mot de passe + PIN.
 *
 * Sécurité :
 *   - Le mot de passe / PIN sont affichés UNE SEULE FOIS dans la console.
 *     Notez-les immédiatement, ils ne sont pas rejouables.
 *   - À utiliser depuis un terminal local sécurisé.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const passwordArg = process.argv[3]?.trim();

  if (!email) {
    console.error('Usage : npm run create:super-admin <email> [mot_de_passe]');
    process.exit(1);
  }

  await withTransaction(async (client) => {
    const existing = await client.query<{
      id: string; full_name: string; role: string;
      organization_id: string; org_name: string;
    }>(
      `SELECT u.id, u.full_name, u.role, u.organization_id, o.name AS org_name
         FROM users u
         JOIN organizations o ON o.id = u.organization_id
        WHERE lower(u.email) = $1`,
      [email],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      if (existing.rowCount > 1) {
        console.error(`✗ Plusieurs comptes pour "${email}" — ciblez l'un par son id :`);
        for (const u of existing.rows) {
          console.error(`  • ${u.full_name} · org "${u.org_name}" · id ${u.id} · role ${u.role}`);
        }
        process.exit(3);
      }
      const u = existing.rows[0]!;
      if (u.role === 'super_admin') {
        console.log(`✓ ${u.full_name} (${email}) est déjà super_admin.`);
        console.log(`  Tenant : "${u.org_name}".`);
        console.log(`  Allez sur /admin pour accéder à la console.`);
        return;
      }
      await client.query(
        `UPDATE users SET role = 'super_admin', updated_at = now() WHERE id = $1`,
        [u.id],
      );
      console.log(`✓ ${u.full_name} (${email}) promu super_admin.`);
      console.log(`  Tenant actuel : "${u.org_name}" (inchangé).`);
      console.log(`  Reconnectez-vous (logout + login) pour rafraîchir la session JWT.`);
      return;
    }

    // ---- Création complète ----

    // 1. Organisation "Webpos Platform" si absente
    let platformId: string;
    const orgRes = await client.query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = 'platform' LIMIT 1`,
    );
    if (orgRes.rowCount && orgRes.rowCount > 0) {
      platformId = orgRes.rows[0]!.id;
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO organizations (name, legal_name, slug, plan)
         VALUES ('Webpos Platform', 'Webpos Platform', 'platform', 'enterprise')
         RETURNING id`,
      );
      platformId = ins.rows[0]!.id;
      console.log(`• Organisation technique "Webpos Platform" créée (slug: platform)`);
    }

    // 2. Mot de passe + PIN
    const password = passwordArg ?? randomBytes(9).toString('base64url'); // 12 caractères
    const pin = String(Math.floor(1000 + Math.random() * 9000));          // 4 chiffres
    const passwordHash = await hashPassword(password);
    const pinHash = await hashPassword(pin);

    await client.query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role, pin_code_hash)
       VALUES ($1, $2, $3, $4, 'super_admin', $5)`,
      [platformId, email, passwordHash, `Admin ${email}`, pinHash],
    );

    console.log(``);
    console.log(`╭───────────────────────────────────────────────────────╮`);
    console.log(`│  ✓ Super admin Webpos POS créé                        │`);
    console.log(`├───────────────────────────────────────────────────────┤`);
    console.log(`│  Email           : ${email.padEnd(35)}│`);
    console.log(`│  Mot de passe    : ${password.padEnd(35)}│`);
    console.log(`│  PIN (caisse)    : ${pin.padEnd(35)}│`);
    console.log(`│  Tenant rattaché : Webpos Platform                    │`);
    console.log(`╰───────────────────────────────────────────────────────╯`);
    console.log(``);
    console.log(`Connexion :`);
    console.log(`  1. Ouvrez /login`);
    console.log(`  2. Cliquez "Accès admin et autres"`);
    console.log(`  3. Email + mot de passe ci-dessus`);
    console.log(`  4. Une fois connecté → ouvrez /admin`);
    console.log(``);
    console.log(`⚠ Notez ces informations maintenant — elles ne seront pas réaffichées.`);
  });
}

main()
  .catch((err) => {
    const m = (err as Error).message ?? '';
    if (m.includes('column "slug"') || m.includes('column "plan"')) {
      console.error('✗ Migration 0010_multi_tenant manquante.');
      console.error('  Lancez : npm run db:migrate');
      process.exit(4);
    }
    if (m.includes('pin_code_hash')) {
      console.error('✗ Migration 0007_user_pin_and_settings manquante.');
      console.error('  Lancez : npm run db:migrate');
      process.exit(5);
    }
    console.error('[create-super-admin] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
