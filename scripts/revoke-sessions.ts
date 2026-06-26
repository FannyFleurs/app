import './load-env';
import { pool, query } from '../lib/db/client';

/**
 * Révoque les sessions actives en base.
 *
 * Usage :
 *   npm run revoke:sessions                  # toutes les sessions actives
 *   npm run revoke:sessions <email>          # seulement celles d'un utilisateur
 *   npm run revoke:sessions @<org_slug>      # seulement celles d'une organisation
 *
 * Utile quand :
 *  - On hit DEVICE_LIMIT_REACHED parce que des sessions sont restées
 *    actives en base alors que le navigateur a perdu son cookie (rebrand,
 *    nettoyage cookies, machine perdue…)
 *  - On veut forcer une déconnexion (vol d'appareil, etc.)
 */
async function main() {
  const arg = process.argv[2]?.trim();

  let where = `revoked_at IS NULL AND expires_at > now()`;
  const params: unknown[] = [];

  if (arg?.startsWith('@')) {
    const slug = arg.slice(1).toLowerCase();
    where += ` AND user_id IN (
      SELECT u.id FROM users u
        JOIN organizations o ON o.id = u.organization_id
       WHERE lower(o.slug) = $1
    )`;
    params.push(slug);
  } else if (arg) {
    where += ` AND user_id IN (SELECT id FROM users WHERE lower(email) = $1)`;
    params.push(arg.toLowerCase());
  }

  const before = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM sessions WHERE ${where}`,
    params,
  );
  const count = Number(before.rows[0]?.c ?? 0);

  if (count === 0) {
    console.log('Aucune session active à révoquer.');
    return;
  }

  await query(
    `UPDATE sessions SET revoked_at = now() WHERE ${where}`,
    params,
  );

  console.log(`✓ ${count} session(s) révoquée(s).`);
  if (!arg) console.log('  (toutes les sessions actives de la base)');
  else if (arg.startsWith('@')) console.log(`  (organisation ${arg})`);
  else console.log(`  (utilisateur ${arg})`);
  console.log('Vous pouvez vous reconnecter normalement.');
}

main()
  .catch((err) => {
    console.error('[revoke-sessions] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
