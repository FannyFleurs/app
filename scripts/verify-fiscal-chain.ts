import './load-env';
import { pool, withTransaction } from '../lib/db/client';
import { FiscalCore } from '../lib/fiscal/core';

async function main() {
  const orgsRes = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM organizations ORDER BY name`,
  );
  for (const o of orgsRes.rows) {
    const r = await withTransaction(async (c) => new FiscalCore(c).verifyChain(o.id));
    // eslint-disable-next-line no-console
    console.log(
      `${r.ok ? '✓' : '✗'} ${o.name} — ${r.inspected} événements${
        r.ok ? '' : ` — ALERTE: ${r.firstError?.reason} @${r.firstError?.index}`
      }`,
    );
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
