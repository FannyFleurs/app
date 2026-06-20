import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = (await readSessionFromCookie())!;

  const t = (await query<{ sales: string; ttc: string; tva: string; ht: string }>(
    `SELECT COUNT(*)::text AS sales,
            COALESCE(SUM(total_ttc),0)::text AS ttc,
            COALESCE(SUM(total_tva),0)::text AS tva,
            COALESCE(SUM(total_ht),0)::text AS ht
       FROM sales
      WHERE organization_id = $1 AND status = 'validated'
        AND validated_at::date = CURRENT_DATE`,
    [user.organizationId],
  )).rows[0]!;

  const yesterday = (await query<{ ttc: string }>(
    `SELECT COALESCE(SUM(total_ttc),0)::text AS ttc FROM sales
      WHERE organization_id = $1 AND status = 'validated'
        AND validated_at::date = CURRENT_DATE - INTERVAL '1 day'`,
    [user.organizationId],
  )).rows[0]!;

  const w = (await query<{ ttc: string; sales: string }>(
    `SELECT COUNT(*)::text AS sales, COALESCE(SUM(total_ttc),0)::text AS ttc
       FROM sales WHERE organization_id = $1 AND status = 'validated'
        AND validated_at >= date_trunc('week', now())`,
    [user.organizationId],
  )).rows[0]!;

  const m = (await query<{ ttc: string; sales: string }>(
    `SELECT COUNT(*)::text AS sales, COALESCE(SUM(total_ttc),0)::text AS ttc
       FROM sales WHERE organization_id = $1 AND status = 'validated'
        AND validated_at >= date_trunc('month', now())`,
    [user.organizationId],
  )).rows[0]!;

  const topProducts = await query<{ label: string; qty: string; ttc: string }>(
    `SELECT sl.label, SUM(sl.quantity)::text AS qty, SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND s.validated_at >= date_trunc('month', now())
      GROUP BY sl.label
      ORDER BY SUM(sl.line_ttc) DESC LIMIT 6`,
    [user.organizationId],
  );

  const byCat = await query<{ name: string; ttc: string; color: string | null }>(
    `SELECT COALESCE(c.name, '— sans catégorie —') AS name, c.color,
            SUM(sl.line_ttc)::text AS ttc
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       LEFT JOIN products p ON p.id = sl.product_id
       LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE s.organization_id = $1 AND s.status = 'validated'
        AND s.validated_at >= date_trunc('month', now())
      GROUP BY c.name, c.color
      ORDER BY SUM(sl.line_ttc) DESC LIMIT 8`,
    [user.organizationId],
  );

  const last = await query<{ receipt_number: string; total_ttc: string; validated_at: string; cashier: string }>(
    `SELECT s.receipt_number, s.total_ttc, s.validated_at, u.full_name AS cashier
       FROM sales s JOIN users u ON u.id = s.user_id
      WHERE s.organization_id = $1 AND s.status = 'validated'
      ORDER BY s.validated_at DESC LIMIT 8`,
    [user.organizationId],
  );

  const lowStock = await query<{ name: string; qty: string; min_stock: string }>(
    `SELECT p.name, sl.quantity::text AS qty, p.min_stock::text
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
      WHERE p.organization_id = $1 AND p.track_stock = TRUE
        AND p.min_stock IS NOT NULL AND sl.quantity <= p.min_stock
      ORDER BY sl.quantity ASC LIMIT 5`,
    [user.organizationId],
  );

  const avg = Number(t.sales) > 0 ? Number(t.ttc) / Number(t.sales) : 0;
  const yest = Number(yesterday.ttc);
  const evol = yest > 0 ? (Number(t.ttc) - yest) / yest : null;
  const maxCat = Math.max(...byCat.rows.map((r) => Number(r.ttc)), 1);

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title={`Bonjour ${user.fullName.split(' ')[0]} ✿`}
        subtitle={`Voici votre activité du ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="CA du jour" value={formatEUR(Number(t.ttc))} sub={`${t.sales} ticket(s)`}
              evol={evol} />
        <Stat label="Panier moyen" value={formatEUR(avg)} sub="aujourd'hui" />
        <Stat label="CA semaine"  value={formatEUR(Number(w.ttc))} sub={`${w.sales} ticket(s)`} />
        <Stat label="CA mois"     value={formatEUR(Number(m.ttc))} sub={`${m.sales} ticket(s)`} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold mb-4 flex items-center justify-between">
            <span>Ventes par catégorie</span>
            <span className="text-xs text-ink-soft font-normal">mois en cours</span>
          </h2>
          {byCat.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune vente ce mois-ci.</p>
          ) : (
            <ul className="space-y-3">
              {byCat.rows.map((c) => {
                const v = Number(c.ttc);
                const pct = (v / maxCat) * 100;
                return (
                  <li key={c.name}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color ?? '#556B3E' }} />
                        {c.name}
                      </span>
                      <span className="font-medium">{formatEUR(v)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-bg overflow-hidden">
                      <div className="h-full bg-sage rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Top produits</h2>
          {topProducts.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune vente ce mois-ci.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topProducts.rows.map((p, i) => (
                <li key={p.label} className="flex justify-between gap-2 border-b border-border/60 pb-2 last:border-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-ink-soft w-4">{i + 1}.</span>
                    <span className="truncate">{p.label}</span>
                  </span>
                  <span className="font-medium whitespace-nowrap">{formatEUR(Number(p.ttc))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Derniers tickets</h2>
          {last.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucun ticket validé.</p>
          ) : (
            <ul className="divide-y divide-border">
              {last.rows.map((s) => (
                <li key={s.receipt_number} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-mono text-xs text-ink-soft">{s.receipt_number}</div>
                    <div className="text-xs text-ink-soft">
                      {s.cashier} · {new Date(s.validated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                  <span className="font-semibold">{formatEUR(Number(s.total_ttc))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3 flex items-center justify-between">
            <span>Alertes stock</span>
            {lowStock.rows.length > 0 && <Badge tone="warning">{lowStock.rows.length}</Badge>}
          </h2>
          {lowStock.rows.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune alerte. Tous les stocks suivis sont au-dessus du seuil.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {lowStock.rows.map((p) => (
                <li key={p.name} className="flex justify-between items-center border-b border-border/60 pb-2 last:border-0">
                  <span>{p.name}</span>
                  <span className="text-warning font-medium">
                    {Number(p.qty)} / seuil {Number(p.min_stock)}
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

function Stat({ label, value, sub, evol }: { label: string; value: string; sub?: string; evol?: number | null }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
        <span>{sub}</span>
        {evol != null && (
          <span className={evol >= 0 ? 'text-success' : 'text-danger'}>
            {evol >= 0 ? '↑' : '↓'} {(Math.abs(evol) * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
