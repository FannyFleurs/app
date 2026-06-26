import './load-env';
import { pool, query } from '../lib/db/client';

/**
 * Affiche tous les utilisateurs en base, avec leur tenant.
 * Utile pour retrouver un email exact ou diagnostiquer un INVALID_CREDENTIALS.
 *
 * Usage :
 *   npm run list:users
 *   npm run list:users <filtre_email>   # filtre LIKE (insensitive)
 */
async function main() {
  const filter = process.argv[2]?.trim().toLowerCase();

  const where = filter ? `WHERE lower(u.email) LIKE $1` : '';
  const params = filter ? [`%${filter}%`] : [];

  const { rows } = await query<{
    email: string; full_name: string; role: string;
    is_active: boolean; has_pin: boolean;
    failed_attempts: number; locked_until: string | null;
    org_name: string; org_slug: string | null;
    last_login_at: string | null;
  }>(
    `SELECT u.email, u.full_name, u.role, u.is_active,
            (u.pin_code_hash IS NOT NULL) AS has_pin,
            u.failed_attempts, u.locked_until,
            o.name AS org_name, o.slug AS org_slug,
            u.last_login_at
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       ${where}
      ORDER BY o.name, u.full_name`,
    params,
  );

  if (rows.length === 0) {
    console.log(filter
      ? `Aucun utilisateur ne correspond au filtre "${filter}".`
      : 'Aucun utilisateur en base.');
    return;
  }

  console.log(``);
  console.log(`${rows.length} utilisateur${rows.length > 1 ? 's' : ''} trouvé${rows.length > 1 ? 's' : ''}.`);
  console.log(``);

  let currentOrg = '';
  for (const u of rows) {
    if (u.org_name !== currentOrg) {
      currentOrg = u.org_name;
      console.log(`▌ Organisation : ${u.org_name}${u.org_slug ? ` (slug: ${u.org_slug})` : ''}`);
    }
    const flags: string[] = [];
    if (!u.is_active) flags.push('inactif');
    if (!u.has_pin) flags.push('sans PIN');
    if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
      flags.push(`verrouillé jusqu'à ${new Date(u.locked_until).toLocaleTimeString('fr-FR')}`);
    }
    if (u.failed_attempts > 0) flags.push(`${u.failed_attempts} tentative(s) échouée(s)`);
    const flagStr = flags.length > 0 ? ` [${flags.join(' · ')}]` : '';
    const last = u.last_login_at
      ? new Date(u.last_login_at).toLocaleString('fr-FR')
      : 'jamais';
    console.log(`   ${u.email.padEnd(35)} ${u.role.padEnd(15)} ${u.full_name.padEnd(25)} dernière conn: ${last}${flagStr}`);
  }
  console.log(``);
  console.log(`Astuces :`);
  console.log(`  npm run reset:password <email>          # forcer un nouveau mot de passe`);
  console.log(`  npm run grant:admin <email>             # promouvoir en super_admin`);
}

main()
  .catch((err) => {
    console.error('[list-users] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
