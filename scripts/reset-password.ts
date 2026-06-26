import './load-env';
import { pool, query, withTransaction } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';
import { randomBytes } from 'node:crypto';

/**
 * Réinitialise le mot de passe d'un utilisateur (admin SaaS ou client).
 *
 * Usage :
 *   npm run reset:password <email> [nouveau_mot_de_passe]
 *
 * Si le mot de passe n'est pas fourni, il est généré aléatoirement et
 * affiché à l'écran (une seule fois).
 *
 * Bonus :
 *   - Déverrouille le compte (failed_attempts = 0, locked_until = NULL).
 *   - Conserve le PIN existant inchangé.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const newPasswordArg = process.argv[3]?.trim();

  if (!email) {
    console.error('Usage : npm run reset:password <email> [nouveau_mot_de_passe]');
    process.exit(1);
  }

  const users = await query<{
    id: string; full_name: string; role: string;
    organization_id: string; org_name: string;
  }>(
    `SELECT u.id, u.full_name, u.role, u.organization_id, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE lower(u.email) = $1`,
    [email],
  );

  if (users.rows.length === 0) {
    console.error(`✗ Aucun utilisateur avec l'email "${email}".`);
    process.exit(2);
  }
  if (users.rows.length > 1) {
    console.error(`✗ Plusieurs comptes pour "${email}" — ciblez par id :`);
    for (const u of users.rows) {
      console.error(`  • ${u.full_name} · org "${u.org_name}" · id ${u.id}`);
    }
    process.exit(3);
  }

  const u = users.rows[0]!;
  const password = newPasswordArg ?? randomBytes(9).toString('base64url');
  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
         SET password_hash = $1,
             failed_attempts = 0,
             locked_until = NULL,
             updated_at = now()
       WHERE id = $2`,
      [passwordHash, u.id],
    );
  });

  console.log(``);
  console.log(`╭───────────────────────────────────────────────────────╮`);
  console.log(`│  ✓ Mot de passe réinitialisé                          │`);
  console.log(`├───────────────────────────────────────────────────────┤`);
  console.log(`│  Email           : ${email.padEnd(35)}│`);
  console.log(`│  Nouveau mdp     : ${password.padEnd(35)}│`);
  console.log(`│  Utilisateur     : ${u.full_name.padEnd(35)}│`);
  console.log(`│  Rôle            : ${u.role.padEnd(35)}│`);
  console.log(`│  Tenant          : ${u.org_name.padEnd(35)}│`);
  console.log(`╰───────────────────────────────────────────────────────╯`);
  console.log(``);
  console.log(`Connexion :`);
  console.log(`  1. Allez sur /login`);
  console.log(`  2. "Accès admin et autres"`);
  console.log(`  3. Email + nouveau mot de passe`);
  console.log(``);
  console.log(`⚠ Le PIN n'a pas été modifié.`);
  console.log(`⚠ Notez le mot de passe maintenant — il ne sera pas réaffiché.`);
}

main()
  .catch((err) => {
    console.error('[reset-password] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
