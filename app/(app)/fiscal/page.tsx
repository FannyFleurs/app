import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';
import { withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import VerifyButton from './VerifyButton';

export const dynamic = 'force-dynamic';

export default async function FiscalPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'fiscal.audit')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const events = await query<{
    immutable_index: string; event_type: string; entity_type: string;
    current_hash: string; previous_hash: string; created_at: string;
  }>(
    `SELECT immutable_index, event_type, entity_type,
            current_hash, previous_hash, created_at
       FROM fiscal_events
      WHERE organization_id = $1
      ORDER BY immutable_index DESC LIMIT 50`,
    [user.organizationId],
  );

  const state = await query<{ next_index: string; last_hash: string; grand_total_ttc: string }>(
    `SELECT next_index, last_hash, grand_total_ttc FROM fiscal_chain_state
      WHERE organization_id = $1`,
    [user.organizationId],
  );

  const verification = await withTransaction(async (client) => {
    const core = new FiscalCore(client);
    return core.verifyChain(user.organizationId);
  });

  const s = state.rows[0];

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Conformité fiscale</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Cœur d&apos;inaltérabilité : événements fiscaux append-only, chaîne de hash SHA-256,
          séquences sans rupture, cumul perpétuel.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-4">
        <Stat label="Événements scellés" value={s ? (BigInt(s.next_index) - 1n).toString() : '0'} />
        <Stat label="Cumul perpétuel TTC" value={s ? `${Number(s.grand_total_ttc).toFixed(2)} €` : '0,00 €'} />
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-ink-soft">Intégrité chaîne</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${verification.ok ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-sm font-medium">
              {verification.ok ? `OK (${verification.inspected} événements)` :
                `ALTÉRATION DÉTECTÉE — ${verification.firstError?.reason ?? '?'} (#${verification.firstError?.index})`}
            </span>
          </div>
          <VerifyButton />
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Derniers événements fiscaux</h2>
          <span className="text-xs text-ink-soft">50 plus récents</span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-bg text-ink-soft text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Entité</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Hash</th>
            </tr>
          </thead>
          <tbody>
            {events.rows.map((e) => (
              <tr key={e.immutable_index} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{e.immutable_index}</td>
                <td className="px-4 py-2 font-medium">{e.event_type}</td>
                <td className="px-4 py-2 text-ink-soft">{e.entity_type}</td>
                <td className="px-4 py-2 text-ink-soft">{new Date(e.created_at).toLocaleString('fr-FR')}</td>
                <td className="px-4 py-2 font-mono text-xs text-ink-soft">{e.current_hash.slice(0,16)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Garanties techniques en place</h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Li>Trigger Postgres bloquant UPDATE/DELETE sur fiscal_events</Li>
          <Li>Hash chain SHA-256 / HMAC sur la totalité des événements</Li>
          <Li>Numérotation séquentielle sans rupture par année</Li>
          <Li>Cumul perpétuel TTC mis à jour à chaque vente</Li>
          <Li>Triggers d&apos;immutabilité sur ventes & factures validées</Li>
          <Li>Audit applicatif append-only séparé du journal fiscal</Li>
          <Li>Sessions de caisse scellées à la fermeture</Li>
          <Li>Clôture journalière, mensuelle, annuelle scellées</Li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><span className="text-sage">●</span>{children}</li>;
}
