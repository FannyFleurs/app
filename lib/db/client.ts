import { Pool, PoolClient } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __webposPool: Pool | undefined;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL non défini');
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    application_name: 'webpos-pos',
  });
}

// Init paresseuse : on n'instancie le pool qu'au premier accès,
// pour ne pas casser `next build` (collecte des pages) sans DATABASE_URL.
export function getPool(): Pool {
  if (!globalThis.__webposPool) globalThis.__webposPool = makePool();
  return globalThis.__webposPool;
}

/**
 * Proxy pratique pour `pool.connect()` / `pool.query()` / `pool.end()`.
 * Évite d'instancier le pool au chargement du module.
 */
export const pool = {
  connect: () => getPool().connect(),
  query: ((text: string, params?: unknown[]) => getPool().query(text, params as unknown[])) as Pool['query'],
  end: () => (globalThis.__webposPool ? globalThis.__webposPool.end() : Promise.resolve()),
} as unknown as Pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params as unknown[]);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

/**
 * Exécute une fonction dans une transaction. Si elle lève, ROLLBACK ; sinon COMMIT.
 * Le client passé doit être utilisé pour TOUTES les requêtes concernées.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}
