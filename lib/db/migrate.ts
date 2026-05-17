import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './client';
import { createHash } from 'node:crypto';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id          TEXT PRIMARY KEY,
        sha256      TEXT NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const id = file.replace(/\.sql$/, '');
      const full = join(MIGRATIONS_DIR, file);
      const sql = readFileSync(full, 'utf8');
      const sha = createHash('sha256').update(sql).digest('hex');

      const existing = await client.query(
        'SELECT sha256 FROM schema_migrations WHERE id = $1',
        [id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        const prev = existing.rows[0]!.sha256 as string;
        if (prev !== sha) {
          throw new Error(
            `Migration ${id} altérée (sha mismatch). Créer une nouvelle migration plutôt que modifier.`,
          );
        }
        continue;
      }

      // eslint-disable-next-line no-console
      console.log(`▶ Migration ${id}…`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (id, sha256) VALUES ($1, $2)',
          [id, sha],
        );
        await client.query('COMMIT');
        // eslint-disable-next-line no-console
        console.log(`✓ ${id}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    client.release();
  }
}
