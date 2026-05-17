import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await readSessionFromCookie())!;

  const today = await query<{
    sales: string; ttc: string; tva: string; ht: string;
  }>(
    `SELECT COUNT(*)::text AS sales,
            COALESCE(SUM(total_ttc),0)::text AS ttc,
            COALESCE(SUM(total_tva),0)::text AS tva,
            COALESCE(SUM(total_ht),0)::text AS ht
       FROM sales
      WHERE organization_id = $1
        AND status = 'validated'
        AND validated_at::date = CURRENT_DATE`,
    [user.organizationId],
  );

  const week = await query<{ ttc: string; sales: string }>(
    `SELECT COUNT(*)::text AS sales, COALESCE(SUM(total_ttc),0)::text AS ttc
       FROM sales
      WHERE organization_id = $1 AND status = 'validated'
        AND validated_at >= date_trunc('week', now())`,
    [user.organizationId],
  );

  const month = await query<{ ttc: string; sales: string }>(
    `SELECT COUNT(*)::text AS sales, COALESCE(SUM(total_ttc),0)::text AS ttc
       FROM sales
      WHERE organization_id = $1 AND status = 'validated'
        AND validated_at >= date_trunc('month', now())`,
    [user.organizationId],
  );

  const topProducts = await query<{ label: string; qty: string; ttc: string }>(
    `SELECT sl.label, SUM(sl.quantity)::text AS qty, SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND s.validated_at >= date_trunc('month', now())
      GROUP BY sl.label
      ORDER BY SUM(sl.line_ttc) DESC
      LIMIT 5`,
    [user.organizationId],
  );

  const last = await query<{
    receipt_number: string; total_ttc: string; validated_at: string;
  }>(
    `SELECT receipt_number, total_ttc, validated_at
       FROM sales
      WHERE organization_id = $1 AND status = 'validated'
      ORDER BY validated_at DESC LIMIT 8`,
    [user.organizationId],
  );

  const t = today.rows[0]!;
  const w = week.rows[0]!;
  const m = month.rows[0]!;
  const avg = Number(t.sales) > 0 ? Number(t.ttc) / Number(t.sales) : 0;

  return (
    <div className="p-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
        <p className="text-sm text-ink-soft">Bonjour {user.fullName.split(' ')[0]}.</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="CA du jour" value={formatEUR(Number(t.ttc))} sub={`${t.sales} ticket(s)`} />
        <Stat label="Panier moyen" value={formatEUR(avg)} sub="aujourd'hui" />
        <Stat label="CA semaine" value={formatEUR(Number(w.ttc))} sub={`${w.sales} ticket(s)`} />
        <Stat label="CA mois" value={formatEUR(Number(m.ttc))} sub={`${m.sales} ticket(s)`} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Top 5 produits du mois</h2>
          {topProducts.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune vente ce mois-ci.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topProducts.rows.map((p) => (
                <li key={p.label} className="flex justify-between border-b border-border/60 pb-2 last:border-0">
                  <span>{p.label}</span>
                  <span className="font-medium">{formatEUR(Number(p.ttc))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Derniers tickets</h2>
          {last.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun ticket validé.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {last.rows.map((s) => (
                <li key={s.receipt_number} className="flex justify-between border-b border-border/60 pb-2 last:border-0">
                  <span className="font-mono text-xs">{s.receipt_number}</span>
                  <span>
                    <span className="text-ink-soft mr-2">
                      {new Date(s.validated_at).toLocaleString('fr-FR', { timeStyle: 'short', dateStyle: 'short' })}
                    </span>
                    <span className="font-medium">{formatEUR(Number(s.total_ttc))}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
