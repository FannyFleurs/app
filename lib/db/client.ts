import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexte tenant de la requête en cours (Row-Level Security).
 * Posé par les gardes d'auth. Transporté via AsyncLocalStorage : chaque
 * requête HTTP a son propre contexte, sans fuite entre requêtes.
 */
interface TenantCtx { org: string | null; bypass: boolean }
const tenantALS = new AsyncLocalStorage<TenantCtx>();

/** Définit le tenant courant (org + bypass super-admin) pour la requête. */
export function setTenant(org: string | null, bypass: boolean): void {
  tenantALS.enterWith({ org, bypass });
}

/** RLS effective seulement si RLS_ENFORCE=1 (rollout piloté, fail-open sinon). */
function rlsOn(): boolean {
  return process.env.RLS_ENFORCE === '1';
}

/**
 * Org à injecter dans le GUC `app.current_org` pour cette requête, ou null
 * (=> accès complet, fail-open) : RLS désactivée, super-admin, ou pas de
 * contexte (auth, webhooks, endpoints publics).
 */
function currentOrg(): string | null {
  if (!rlsOn()) return null;
  const s = tenantALS.getStore();
  if (!s || s.bypass || !s.org) return null;
  return s.org;
}

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
    application_name: 'webpos',
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
  const org = currentOrg();
  // Chemin normal (RLS off / super-admin / hors contexte) : pas de surcoût.
  if (!org) {
    const res = await getPool().query(text, params as unknown[]);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  }
  // RLS active : le GUC DOIT être transaction-local (set_config(..., true))
  // pour être sûr avec le pooler (PgBouncer réutilise les connexions).
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_org', $1, true)`, [org]);
    const res = await client.query(text, params as unknown[]);
    await client.query('COMMIT');
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
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
    const org = currentOrg();
    if (org) {
      await client.query(`SELECT set_config('app.current_org', $1, true)`, [org]);
    }
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
