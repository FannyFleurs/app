import './load-env';
import { pool, query } from '../lib/db/client';

/**
 * Accorde le rôle `super_admin` à un utilisateur existant.
 *
 * Usage :
 *   npm run grant:admin <email>
 *   npm run grant:admin contact@swebio.fr
 *
 * Sécurité :
 * - L'utilisateur doit déjà exister (créé via /setup ou la console).
 * - Si plusieurs utilisateurs partagent le même email (multi-tenant),
 *   on liste les tenants concernés et on demande de cibler par id.
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run grant:admin <email>');
    process.exit(1);
  }

  const rows = await query<{
    id: string; full_name: string; role: string;
    organization_id: string; org_name: string;
  }>(
    `SELECT u.id, u.full_name, u.role, u.organization_id, o.name AS org_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
      WHERE lower(u.email) = $1
      ORDER BY u.created_at`,
    [email],
  );

  if (rows.rows.length === 0) {
    console.error(`✗ Aucun utilisateur avec l'email "${email}" trouvé.`);
    console.error(
      `  Créez-le d'abord via /setup (wizard) ou la console "Gestion utilisateurs".`,
    );
    process.exit(2);
  }

  if (rows.rows.length > 1) {
    console.error(`✗ Plusieurs utilisateurs trouvés pour "${email}" :`);
    for (const u of rows.rows) {
      console.error(`  • ${u.full_name} · org "${u.org_name}" · id ${u.id} · role ${u.role}`);
    }
    console.error(`\nCiblez l'utilisateur précis avec son id :`);
    console.error(`  UPDATE users SET role = 'super_admin' WHERE id = '<id>';`);
    process.exit(3);
  }

  const u = rows.rows[0]!;
  if (u.role === 'super_admin') {
    console.log(`✓ ${u.full_name} (${email}) est déjà super_admin. Rien à faire.`);
    return;
  }

  await query(
    `UPDATE users SET role = 'super_admin', updated_at = now() WHERE id = $1`,
    [u.id],
  );

  console.log(`✓ ${u.full_name} (${email}) promu super_admin.`);
  console.log(`  Tenant initial : "${u.org_name}".`);
  console.log(`  Déconnectez-vous puis reconnectez-vous pour rafraîchir la session.`);
  console.log(`  Vous pourrez alors accéder à /admin.`);
}

main()
  .catch((err) => {
    console.error('[grant-admin] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
