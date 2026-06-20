import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import { query } from '@/lib/db/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

export default async function ExportsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'fiscal.export')) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const exports = await query<{
    id: string; period_start: string; period_end: string;
    format: string; size_bytes: string; sha256: string;
    created_at: string; generated_by: string;
  }>(
    `SELECT e.id, e.period_start, e.period_end, e.format,
            e.size_bytes::text, e.sha256, e.created_at,
            u.full_name AS generated_by
       FROM accounting_exports e
       JOIN users u ON u.id = e.generated_by
      WHERE e.organization_id = $1
      ORDER BY e.created_at DESC LIMIT 50`,
    [user.organizationId],
  );

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Exports comptables"
        subtitle="Générez des paquets pour votre expert-comptable : ventes, TVA collectée, paiements, écritures."
        badge={{ label: 'Module Phase 3 — schéma actif', tone: 'soft' }}
      />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold">Nouvel export</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Sélectionnez une période et un format. Chaque export génère un fichier signé (SHA-256) et tracé dans l&apos;audit.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-soft">Du</label>
              <input type="date" className="input mt-1" disabled />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-soft">Au</label>
              <input type="date" className="input mt-1" disabled />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-ink-soft">Format</label>
              <select className="input mt-1" disabled>
                <option>CSV expert-comptable</option>
                <option>Écritures comptables CSV</option>
                <option>JSON détaillé</option>
                <option>FEC-like (informatif)</option>
              </select>
            </div>
          </div>
          <button className="btn-primary mt-4 w-full" disabled title="Phase 3">Générer l&apos;export</button>
          <p className="mt-2 text-xs text-ink-soft">
            L&apos;export FEC-like est fourni à titre informatif et ne remplace pas le FEC produit par votre comptable.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Plan comptable</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Mapping des comptes (à configurer dans les Paramètres). Phase 3.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            <PlanRow code="707000" label="Ventes de marchandises" tone="soft" />
            <PlanRow code="445710" label="TVA collectée 20%" />
            <PlanRow code="445711" label="TVA collectée 10%" />
            <PlanRow code="445712" label="TVA collectée 5,5%" />
            <PlanRow code="411000" label="Clients" />
            <PlanRow code="530000" label="Caisse — espèces" />
            <PlanRow code="512000" label="Banque" />
            <PlanRow code="709000" label="Remises accordées" />
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-2">Historique des exports</h2>
        {exports.rowCount === 0 ? (
          <EmptyState
            icon="◇"
            title="Aucun export généré"
            description="Les exports comptables sont disponibles à partir de la Phase 3."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg text-ink-soft text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Période</th>
                  <th className="text-left px-4 py-3">Format</th>
                  <th className="text-right px-4 py-3">Taille</th>
                  <th className="text-left px-4 py-3">Auteur</th>
                  <th className="text-left px-4 py-3">SHA-256</th>
                  <th className="text-left px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {exports.rows.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-3">{e.period_start} → {e.period_end}</td>
                    <td className="px-4 py-3"><Badge tone="neutral">{e.format}</Badge></td>
                    <td className="px-4 py-3 text-right text-ink-soft">{formatBytes(Number(e.size_bytes))}</td>
                    <td className="px-4 py-3 text-ink-soft">{e.generated_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">{e.sha256.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(e.created_at).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PlanRow({ code, label, tone }: { code: string; label: string; tone?: 'soft' }) {
  return (
    <li className="flex items-center gap-3 border-b border-border/60 pb-1.5 last:border-0">
      <code className={`font-mono text-xs px-1.5 py-0.5 rounded ${tone === 'soft' ? 'bg-sage-soft text-sage-deep' : 'bg-bg text-ink-soft'}`}>
        {code}
      </code>
      <span>{label}</span>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(2)} Mo`;
}
