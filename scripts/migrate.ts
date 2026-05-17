import './load-env';
import { runMigrations } from '../lib/db/migrate';
import { pool } from '../lib/db/client';

async function main() {
  await runMigrations();
  // eslint-disable-next-line no-console
  console.log('✓ Migrations terminées');
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
