import { notFound } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import Tabs from '@/components/Tabs';
import WalletActions from './WalletActions';
import LoyaltyPanel from './LoyaltyPanel';

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
  particulier: 'Particulier',
  professionnel: 'Pro',
  collectivite: 'Collectivité',
  association: 'Association',
};

const LOYALTY_TYPE_LABEL: Record<string, string> = {
  earn: 'Gain',
  redeem: 'Utilisation',
  adjust: 'Régularisation',
  expire: 'Expiration',
  cancel: 'Annulation',
};

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'customers.read'))) return <div className="p-8">Accès refusé.</div>;

  const cust = await query<{
    id: string; type: string;
    first_name: string | null; last_name: string | null; company_name: string | null;
    email: string | null; phone: string | null; siret: string | null; vat_number: string | null;
    address: { line1?: string; zip?: string; city?: string; country?: string } | null;
    consent_email: boolean; consent_sms: boolean;
    internal_notes: string | null; loyalty_code: string | null;
    default_discount_pct: string | null;
    created_at: string;
  }>(
    `SELECT id, type, first_name, last_name, company_name, email, phone,
            siret, vat_number, address, consent_email, consent_sms,
            internal_notes, loyalty_code, default_discount_pct, created_at
       FROM customers WHERE id = $1 AND organization_id = $2`,
    [params.id, user.organizationId],
  );
  if (cust.rowCount === 0) notFound();
  const c = cust.rows[0]!;

  const sales = await query<{
    id: string; receipt_number: string; total_ttc: string; validated_at: string;
  }>(
    `SELECT id, receipt_number, total_ttc, validated_at
       FROM sales
      WHERE customer_id = $1 AND status = 'validated'
      ORDER BY validated_at DESC LIMIT 50`,
    [params.id],
  );

  const loyalty = await query<{
    points_balance: string;
    movements: { movement_type: string; points_delta: number; balance_after: number; reason: string | null; created_at: string }[];
  }>(
    `SELECT SUM(la.points_balance)::text AS points_balance,
            COALESCE(json_agg(json_build_object(
              'movement_type', lm.movement_type,
              'points_delta', lm.points_delta,
              'balance_after', lm.balance_after,
              'reason', lm.reason,
              'created_at', lm.created_at
            ) ORDER BY lm.created_at DESC) FILTER (WHERE lm.id IS NOT NULL), '[]'::json) AS movements
       FROM loyalty_accounts la
       LEFT JOIN loyalty_movements lm ON lm.account_id = la.id
      WHERE la.customer_id = $1`,
    [params.id],
  );

  // Cartes cadeaux & bons d'achat rattachés au client (bénéficiaire).
  const giftCards = await query<{
    id: string; code: string; balance: string; initial_amount: string;
    status: string; kind: string; expires_at: string | null;
  }>(
    `SELECT id, code, balance::text, initial_amount::text, status,
            COALESCE(kind, 'gift_card') AS kind, expires_at
       FROM gift_cards
      WHERE organization_id = $1 AND beneficiary_id = $2
        AND status <> 'cancelled'
      ORDER BY issued_at DESC`,
    [user.organizationId, params.id],
  ).catch(() => ({ rows: [] as { id: string; code: string; balance: string; initial_amount: string; status: string; kind: string; expires_at: string | null }[] }));

  const addresses = await query<{ label: string; line1: string; zip: string; city: string; is_default: boolean }>(
    `SELECT label, line1, zip, city, is_default
       FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at`,
    [params.id],
  );

  const totalTtc = sales.rows.reduce((s, x) => s + Number(x.total_ttc), 0);
  const display = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
  // Solde fidélité en euros (1 « point » applicatif = 1 €). NULL = aucun compte.
  const loyBalanceRaw = loyalty.rows[0]?.points_balance ?? null;
  const loyBalance = loyBalanceRaw != null ? Number(loyBalanceRaw) : null;
  const loyMovements = loyalty.rows[0]?.movements ?? [];

  return (
    <div className="p-6 md:p-8 space-y-5">
      <Link href="/customers" className="text-sm text-ink-soft hover:text-ink">← Tous les clients</Link>

      <PageHeader
        title={display}
        subtitle={`Client depuis le ${new Date(c.created_at).toLocaleDateString('fr-FR')}.`}
        badge={{ label: TYPE_LABEL[c.type] ?? c.type, tone: 'soft' }}
        actions={(
          <>
            <button className="btn-soft" disabled title="Phase 2">Modifier</button>
            {(await userCan(user, 'customers.anonymize')) && (
              <button className="btn-ghost text-danger" disabled title="Phase 2">Anonymiser (RGPD)</button>
            )}
          </>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total dépensé" value={formatEUR(totalTtc)} />
        <Kpi label="Achats" value={sales.rowCount.toString()} />
        <Kpi label="Panier moyen" value={formatEUR(sales.rowCount ? totalTtc / sales.rowCount : 0)} />
        <Kpi label="Solde fidélité" value={loyBalance != null ? formatEUR(loyBalance) : '—'} />
      </section>

      {c.default_discount_pct && Number(c.default_discount_pct) > 0 && (
        <div className="card p-4 flex items-center gap-3">
          <span className="text-xl">★</span>
          <div>
            <div className="font-medium text-sm">Remise systématique : -{Number(c.default_discount_pct)}%</div>
            <div className="text-xs text-ink-soft">
              Appliquée automatiquement à chaque ligne du ticket quand ce client est attaché.
            </div>
          </div>
        </div>
      )}

      <Tabs tabs={[
        {
          key: 'info',
          label: 'Informations',
          content: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5">
                <h3 className="font-semibold mb-3">Identité</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Item label="Type" value={TYPE_LABEL[c.type] ?? c.type} />
                  <Item label="Email" value={c.email ?? '—'} />
                  <Item label="Téléphone" value={c.phone ?? '—'} />
                  <Item label="Code fidélité" value={c.loyalty_code ?? '—'} />
                  {c.type !== 'particulier' && (
                    <>
                      <Item label="SIRET" value={c.siret ?? '—'} />
                      <Item label="TVA intra." value={c.vat_number ?? '—'} />
                    </>
                  )}
                </dl>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold mb-3">Adresse principale</h3>
                <div className="text-sm space-y-0.5">
                  <div>{c.address?.line1 ?? '—'}</div>
                  <div>{[c.address?.zip, c.address?.city].filter(Boolean).join(' ') || ''}</div>
                  <div className="text-ink-soft">{c.address?.country ?? ''}</div>
                </div>
                <h3 className="font-semibold mt-5 mb-2">RGPD</h3>
                <div className="flex gap-2 text-xs">
                  <Badge tone={c.consent_email ? 'success' : 'neutral'}>
                    Email : {c.consent_email ? 'consenti' : 'non'}
                  </Badge>
                  <Badge tone={c.consent_sms ? 'success' : 'neutral'}>
                    SMS : {c.consent_sms ? 'consenti' : 'non'}
                  </Badge>
                </div>
              </div>
              {c.internal_notes && (
                <div className="card p-5 md:col-span-2">
                  <h3 className="font-semibold mb-2">Notes internes</h3>
                  <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.internal_notes}</p>
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'sales',
          label: `Historique d'achats (${sales.rowCount})`,
          content: sales.rowCount === 0 ? (
            <p className="text-sm text-ink-soft">Aucune vente associée.</p>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg text-ink-soft text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">Ticket</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Total TTC</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.rows.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{s.receipt_number}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {new Date(s.validated_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(s.total_ttc))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          key: 'loyalty',
          label: 'Fidélité',
          content: (
            <div className="space-y-3">
              <WalletActions
                customerId={params.id}
                customerEmail={c.email}
                customerPhone={c.phone}
              />
              <LoyaltyPanel
                customerId={params.id}
                balance={loyBalance ?? 0}
                giftCards={giftCards.rows}
              />
              <div className="card overflow-hidden">
                <div className="px-4 py-3 text-sm font-medium border-b border-border">Mouvements de fidélité</div>
                <table className="w-full text-sm">
                  <thead className="bg-bg text-ink-soft text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Date</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Variation</th>
                      <th className="text-right px-4 py-3">Solde après</th>
                      <th className="text-left px-4 py-3">Motif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loyMovements.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-ink-soft">Aucun mouvement.</td></tr>
                    ) : loyMovements.map((m, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-4 py-3 text-ink-soft text-xs">{new Date(m.created_at).toLocaleString('fr-FR')}</td>
                        <td className="px-4 py-3">{LOYALTY_TYPE_LABEL[m.movement_type] ?? m.movement_type}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${Number(m.points_delta) >= 0 ? 'text-success' : 'text-danger'}`}>
                          {Number(m.points_delta) > 0 ? '+' : ''}{formatEUR(Number(m.points_delta))}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatEUR(Number(m.balance_after))}</td>
                        <td className="px-4 py-3 text-ink-soft">{m.reason ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
        {
          key: 'addresses',
          label: `Adresses (${addresses.rowCount})`,
          content: addresses.rowCount === 0 ? (
            <p className="text-sm text-ink-soft">Aucune adresse complémentaire enregistrée.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {addresses.rows.map((a, i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{a.label || 'Adresse'}</span>
                    {a.is_default && <Badge tone="soft">Par défaut</Badge>}
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">{a.line1}</div>
                  <div className="text-sm text-ink-soft">{a.zip} {a.city}</div>
                </div>
              ))}
            </div>
          ),
        },
      ]} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
