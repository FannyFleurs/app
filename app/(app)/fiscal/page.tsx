import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query, withTransaction } from '@/lib/db/client';
import { FiscalCore } from '@/lib/fiscal/core';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
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
    `SELECT immutable_index, event_type, entity_type, current_hash, previous_hash, created_at
       FROM fiscal_events WHERE organization_id = $1
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

  const auditCount = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM audit_logs WHERE organization_id = $1`,
    [user.organizationId],
  );

  const s = state.rows[0];
  const eventsCount = s ? (BigInt(s.next_index) - 1n).toString() : '0';

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Conformité fiscale"
        subtitle="Cœur d'inaltérabilité : événements append-only, hash chaîné SHA-256, séquences sans rupture, cumul perpétuel."
        badge={
          verification.ok
            ? { label: '✓ Chaîne intègre', tone: 'success' }
            : { label: '✗ Altération détectée', tone: 'warning' }
        }
      />

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Événements scellés" value={eventsCount} hint="depuis la création" />
        <Stat label="Cumul perpétuel TTC"
              value={s ? `${Number(s.grand_total_ttc).toFixed(2)} €` : '0,00 €'}
              hint="grand total cumulé non remis à zéro" />
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wider text-ink-soft">Intégrité de la chaîne</div>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${verification.ok ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-lg font-semibold tracking-tight">
              {verification.ok ? `OK` : `ALERTE`}
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-soft">
            {verification.ok
              ? `${verification.inspected} événement(s) vérifié(s)`
              : `${verification.firstError?.reason} @${verification.firstError?.index}`}
          </div>
          <VerifyButton />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Garanties techniques en place</h2>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Check>Trigger Postgres bloquant UPDATE/DELETE sur 12 tables append-only</Check>
          <Check>Hash chaîné SHA-256 / HMAC sur tous les événements fiscaux</Check>
          <Check>Numérotation séquentielle sans rupture par année</Check>
          <Check>Cumul perpétuel TTC inscrit dans chaque événement</Check>
          <Check>Triggers d&apos;immutabilité sur ventes & factures validées</Check>
          <Check>Audit applicatif append-only séparé du journal fiscal</Check>
          <Check>Sessions de caisse scellées à la fermeture</Check>
          <Check>Clôtures journalières / mensuelles / annuelles scellées</Check>
          <Check>Snapshot ticket figé en JSONB dans receipts</Check>
          <Check>Validation zod côté serveur sur toutes les routes</Check>
          <Check>RBAC à 7 rôles + permission void_validated_sale = ∅</Check>
          <Check>Historique des prix produit (append-only avec auteur)</Check>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Derniers événements fiscaux
          </h2>
          <span className="text-xs text-ink-soft">
            {events.rowCount} affichés · {auditCount.rows[0]?.c ?? 0} lignes d&apos;audit applicatif au total
          </span>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg text-ink-soft text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 w-16">#</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Entité</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Hash courant</th>
                <th className="text-left px-4 py-3">Hash précédent</th>
              </tr>
            </thead>
            <tbody>
              {events.rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  Aucun événement enregistré pour le moment.
                </td></tr>
              ) : events.rows.map((e) => (
                <tr key={e.immutable_index} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{e.immutable_index}</td>
                  <td className="px-4 py-2"><Badge tone="soft">{e.event_type}</Badge></td>
                  <td className="px-4 py-2 text-ink-soft text-xs">{e.entity_type}</td>
                  <td className="px-4 py-2 text-ink-soft text-xs">{new Date(e.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{e.current_hash.slice(0,16)}…</td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft">{e.previous_hash.slice(0,16)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 bg-sage-soft/40">
        <h2 className="font-semibold">À noter</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Webpos est conçu <em>certification-ready</em> mais n&apos;est pas certifié par cette
          implémentation seule. Une attestation individuelle éditeur ou une démarche
          NF525 / LNE reste à effectuer par un organisme habilité. Le dossier technique
          détaillé est disponible dans <code className="bg-white px-1 rounded">docs/conformite.md</code>.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}
function Check({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2"><span className="text-sage mt-0.5">●</span><span>{children}</span></div>;
}
