import './load-env';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pool, query } from '../lib/db/client';

/**
 * Re-synchronise les sha des migrations DÉJÀ APPLIQUÉES en base avec
 * le contenu actuel des fichiers .sql sur disque.
 *
 * À utiliser UNIQUEMENT quand on a modifié une migration de manière
 * cosmétique (commentaire, espaces, accents, mise en forme) qui ne
 * change pas le DDL appliqué. Le runner refuse normalement de
 * continuer pour protéger l'intégrité — ce script débloque la
 * situation après vérification humaine.
 *
 * Usage :
 *   npm run db:migrate:resync                   # interactif, liste les écarts
 *   npm run db:migrate:resync --force           # corrige automatiquement
 */
async function main() {
  const force = process.argv.includes('--force');

  const files = readdirSync(join(process.cwd(), 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const drift: Array<{ id: string; newSha: string }> = [];

  for (const file of files) {
    const id = file.replace(/\.sql$/, '');
    const sql = readFileSync(join(process.cwd(), 'migrations', file), 'utf8');
    const newSha = createHash('sha256').update(sql).digest('hex');

    const r = await query<{ sha256: string }>(
      `SELECT sha256 FROM schema_migrations WHERE id = $1`,
      [id],
    );
    if (r.rowCount === 0) continue; // pas encore appliquée, le runner s'en chargera
    if (r.rows[0]!.sha256 !== newSha) {
      drift.push({ id, newSha });
    }
  }

  if (drift.length === 0) {
    console.log('✓ Toutes les migrations sont à jour, rien à faire.');
    return;
  }

  console.log(`${drift.length} migration(s) avec un sha différent :`);
  for (const d of drift) console.log(`  • ${d.id}`);

  if (!force) {
    console.log('');
    console.log('Pour corriger : npm run db:migrate:resync -- --force');
    console.log('⚠ Ne le fais QUE si tu sais que les modifications sont cosmétiques');
    console.log('  (commentaires, mise en forme). Si le DDL réel a changé, crée une');
    console.log('  nouvelle migration à la place.');
    return;
  }

  for (const d of drift) {
    await query(
      `UPDATE schema_migrations SET sha256 = $1 WHERE id = $2`,
      [d.newSha, d.id],
    );
    console.log(`✓ ${d.id} resynchronisée`);
  }
  console.log('');
  console.log('Tu peux maintenant relancer : npm run db:migrate');
}

main()
  .catch((err) => {
    console.error('[migrate-resync] erreur :', err);
    process.exit(99);
  })
  .finally(() => pool.end());
