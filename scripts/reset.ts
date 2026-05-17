import './load-env';
import { pool } from '../lib/db/client';

async function main() {
  const client = await pool.connect();
  try {
    // eslint-disable-next-line no-console
    console.log('⚠ Suppression du schéma public (DROP CASCADE)');
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO public;
    `);
    // eslint-disable-next-line no-console
    console.log('✓ Reset terminé. Exécutez `npm run db:seed`.');
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
