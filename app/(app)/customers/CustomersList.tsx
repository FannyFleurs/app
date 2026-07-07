'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import CustomerFormModal, { type CustomerLike } from '@/components/CustomerFormModal';
import { formatEUR } from '@/lib/services/money';
import WalletActions from './[id]/WalletActions';

interface Customer {
  id: string;
  type: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  siret: string | null;
  nb_sales: string;
  last_visit: string | null;
  total_ttc: string;
  loyalty_points: string | null;
  default_discount_pct?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  particulier: 'Particulier',
  professionnel: 'Pro',
  collectivite: 'Collectivité',
  association: 'Association',
};

interface CustomerDetail {
  customer: {
    id: string; type: string;
    first_name: string | null; last_name: string | null; company_name: string | null;
    email: string | null; phone: string | null; siret: string | null; vat_number: string | null;
    address: { line1?: string; zip?: string; city?: string; country?: string } | null;
    consent_email: boolean; consent_sms: boolean;
    internal_notes: string | null; loyalty_code: string | null;
    created_at: string;
  };
  sales: { id: string; receipt_number: string; total_ttc: string; validated_at: string }[];
  loyalty_points: number | null;
}

type Tab =
  | 'dashboard'
  | 'informations'
  | 'commentaires'
  | 'tickets'
  | 'achats'
  | 'fidelite'
  | 'bons-achats';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'informations', label: 'Informations' },
  { key: 'commentaires', label: 'Commentaires' },
  { key: 'tickets',      label: 'Liste des tickets' },
  { key: 'achats',       label: 'Liste des achats' },
  { key: 'fidelite',     label: 'Fidélité' },
  { key: 'bons-achats',  label: 'Bons d\'achats' },
];

export default function CustomersList({ customers: initialCustomers, canWrite }: { customers: Customer[]; canWrite: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState(initialCustomers);
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Selection automatique via ?id=<uuid> (utilise depuis /caisse quand
  // on clique sur le nom du client attache au ticket).
  useEffect(() => {
    const id = searchParams.get('id');
    if (id && id !== selectedId) void selectCustomer(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState<CustomerLike | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('dashboard');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (type !== 'all' && c.type !== type) return false;
      if (!needle) return true;
      return (
        c.display_name?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle) ||
        c.phone?.includes(needle) ||
        c.company_name?.toLowerCase().includes(needle) ||
        c.siret?.includes(needle)
      );
    });
  }, [customers, q, type]);

  async function selectCustomer(id: string) {
    setSelectedId(id);
    setTab('dashboard');
    setLoadingDetail(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/customers/${id}`);
      if (res.ok) setDetail(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[320px_240px_1fr] md:h-full md:overflow-hidden">
        {/* COLONNE 1 — Liste clients */}
        <aside className="border-r border-border bg-white flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">Section</div>
              <div className="text-lg font-semibold tracking-tight">Comptes clients</div>
            </div>
            <span className="text-xs text-ink-soft">{customers.length} clients</span>
          </div>
          <div className="p-3 space-y-2 border-b border-border">
            <div className="relative">
              <input
                className="input pr-9"
                placeholder="Rechercher…"
                value={q} onChange={(e) => setQ(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['all', 'particulier', 'professionnel', 'collectivite', 'association'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium border transition-colors ${
                    type === t ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border hover:border-gray-300'
                  }`}
                >
                  {t === 'all' ? 'Tous' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-ink-soft text-sm">
                {customers.length === 0 ? 'Aucun client.' : 'Aucun résultat.'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((c) => {
                  const isActive = c.id === selectedId;
                  const subline =
                    c.email ?? c.phone ?? (c.company_name ?? '—');
                  return (
                    <button
                      key={c.id}
                      onClick={() => void selectCustomer(c.id)}
                      className={`w-full text-left px-4 py-3 transition-colors ${
                        isActive ? 'bg-accent-soft' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{c.display_name || '—'}</span>
                        <Badge tone="neutral">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-soft truncate">{subline}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-border p-3 bg-white">
            {canWrite && (
              <button onClick={() => setEditing(null)} className="btn-primary w-full h-11">
                + Ajouter un client
              </button>
            )}
          </div>
        </aside>

        {/* COLONNE 2 — Sous-navigation client */}
        <nav className="border-r border-border bg-white overflow-y-auto">
          {!selectedId ? (
            <div className="p-6 text-center text-ink-soft text-sm">
              Sélectionnez un client.
            </div>
          ) : (
            <div className="p-3 space-y-0.5">
              {TABS.map((t) => {
                const active = t.key === tab;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`w-full text-left rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-accent-soft text-accent-deep'
                        : 'text-ink-soft hover:text-ink hover:bg-gray-50'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        {/* COLONNE 3 — Contenu */}
        <main className="overflow-y-auto bg-white">
          {!selectedId ? (
            <div className="h-full grid place-items-center p-10">
              <EmptyState
                icon="◉"
                title="Sélectionnez un client"
                description="La fiche complète, son historique et sa fidélité s'affichent ici."
              />
            </div>
          ) : loadingDetail || !detail ? (
            <div className="p-10 text-center text-ink-soft text-sm">Chargement…</div>
          ) : (
            <CustomerDetailContent
              tab={tab}
              detail={detail}
              canWrite={canWrite}
              onEdit={() => setEditing(detail.customer as unknown as CustomerLike)}
            />
          )}
        </main>
      </div>

      {editing !== undefined && (
        <CustomerFormModal
          customer={editing}
          onClose={() => setEditing(undefined)}
          onSaved={(id) => {
            setEditing(undefined);
            void selectCustomer(id);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CustomerDetailContent({ tab, detail, canWrite, onEdit }: {
  tab: Tab; detail: CustomerDetail; canWrite: boolean; onEdit: () => void;
}) {
  const c = detail.customer;
  const display = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
  const totalTtc = detail.sales.reduce((s, x) => s + Number(x.total_ttc), 0);
  const avg = detail.sales.length > 0 ? totalTtc / detail.sales.length : 0;
  const lastVisit = detail.sales[0]?.validated_at;
  const [balances, setBalances] = useState<{
    account_balance: number;
    gift_card_balance: number;
    credit_notes_balance: number;
  }>({ account_balance: 0, gift_card_balance: 0, credit_notes_balance: 0 });

  useEffect(() => {
    setBalances({ account_balance: 0, gift_card_balance: 0, credit_notes_balance: 0 });
    void fetch(`/api/customers/${c.id}/balances`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (j) setBalances({
          account_balance: Number(j.account_balance) || 0,
          gift_card_balance: Number(j.gift_card_balance) || 0,
          credit_notes_balance: Number(j.credit_notes_balance) || 0,
        });
      })
      .catch(() => undefined);
  }, [c.id]);
  const accountDue = balances.account_balance < 0 ? -balances.account_balance : 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{display}</h2>
          <div className="text-sm text-ink-soft mt-0.5">
            {lastVisit
              ? <>Dernière visite le {new Date(lastVisit).toLocaleDateString('fr-FR')}</>
              : <>Client depuis le {new Date(c.created_at).toLocaleDateString('fr-FR')}</>
            }
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canWrite && (
            <button onClick={onEdit} className="btn-primary text-sm">
              Modifier client
            </button>
          )}
        </div>
      </div>

      {tab === 'dashboard' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Tile value={formatEUR(totalTtc)}                       label="Total des achats" />
          <Tile value={formatEUR(accountDue)}                     label="Montant dû (en compte)"
                tone={accountDue > 0 ? 'danger' : undefined} />
          <Tile value={detail.sales.length.toString()}            label="Nombre de passages" />
          <Tile value={formatEUR(avg)}                            label="Ticket moyen TTC" />
          <Tile value={formatEUR(balances.credit_notes_balance)}  label="Crédits à dépenser" />
          <Tile value={formatEUR(balances.gift_card_balance)}     label="Bons cadeaux à dépenser" />
          <Tile value={(detail.loyalty_points ?? 0).toString()}   label="Points de fidélité" />
        </div>
      )}

      {tab === 'informations' && (
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
            <h3 className="font-semibold mb-3">Adresse</h3>
            <div className="text-sm space-y-0.5">
              <div>{c.address?.line1 ?? '—'}</div>
              <div>{[c.address?.zip, c.address?.city].filter(Boolean).join(' ') || ''}</div>
            </div>
            <h3 className="font-semibold mt-5 mb-2">RGPD</h3>
            <div className="flex gap-2">
              <Badge tone={c.consent_email ? 'success' : 'neutral'}>
                Email : {c.consent_email ? 'consenti' : 'non'}
              </Badge>
              <Badge tone={c.consent_sms ? 'success' : 'neutral'}>
                SMS : {c.consent_sms ? 'consenti' : 'non'}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {tab === 'commentaires' && (
        <div className="card p-5">
          <h3 className="font-semibold mb-2">Notes internes</h3>
          <p className="text-sm text-ink-soft whitespace-pre-wrap min-h-[120px]">
            {c.internal_notes ?? 'Aucune note enregistrée.'}
          </p>
        </div>
      )}

      {tab === 'tickets' && <TicketsTable sales={detail.sales} link />}
      {tab === 'achats'  && <PurchasedItemsTable customerId={c.id} />}

      {tab === 'fidelite' && (
        <div className="space-y-3">
          <div className="card p-5">
            <h3 className="font-semibold mb-2">Solde fidélité</h3>
            <div className="text-3xl font-semibold">
              {detail.loyalty_points != null ? `${detail.loyalty_points} pts` : '—'}
            </div>
            <p className="text-xs text-ink-soft mt-2">
              Le solde est crédité automatiquement à chaque vente validée, selon le programme actif.
            </p>
          </div>
          <WalletActions
            customerId={c.id}
            customerEmail={c.email}
            customerPhone={c.phone}
          />
        </div>
      )}

      {tab === 'bons-achats' && (
        <div className="card p-5 text-sm text-ink-soft">
          Aucun bon d&apos;achat enregistré pour ce client.
        </div>
      )}
    </div>
  );
}

function PurchasedItemsTable({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<Array<{
    product_id: string | null; label: string;
    total_quantity: string; total_ttc: string;
    receipt_count: string; last_purchase_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/customers/${customerId}/purchases`)
      .then((r) => r.ok ? r.json() : { purchases: [] })
      .then((j) => setItems(j.purchases ?? []))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="card p-8 text-center text-ink-soft text-sm">Chargement…</div>;
  if (items.length === 0) {
    return <div className="card p-8 text-center text-ink-soft text-sm">Aucun article acheté.</div>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Article</th>
            <th className="text-right px-4 py-3 font-semibold">Quantité totale</th>
            <th className="text-right px-4 py-3 font-semibold">Nb tickets</th>
            <th className="text-right px-4 py-3 font-semibold">CA TTC cumulé</th>
            <th className="text-left px-4 py-3 font-semibold">Dernier achat</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.product_id ?? 'free'}-${i}`} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{it.label}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {Number(it.total_quantity).toFixed(0)}
              </td>
              <td className="px-4 py-2 text-right text-ink-soft">{it.receipt_count}</td>
              <td className="px-4 py-2 text-right font-medium">
                {formatEUR(Number(it.total_ttc))}
              </td>
              <td className="px-4 py-2 text-ink-soft text-xs">
                {new Date(it.last_purchase_at).toLocaleDateString('fr-FR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TicketsTable({ sales, link }: { sales: CustomerDetail['sales']; link?: boolean }) {
  if (sales.length === 0) {
    return <div className="card p-8 text-center text-ink-soft text-sm">Aucun achat enregistré.</div>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Ticket</th>
            <th className="text-left px-4 py-3 font-semibold">Date</th>
            <th className="text-right px-4 py-3 font-semibold">Total TTC</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="px-4 py-2 font-mono text-xs">
                {link
                  ? <Link href={`/ma-journee?focus=${s.id}`} className="text-accent-deep hover:underline">{s.receipt_number}</Link>
                  : s.receipt_number}
              </td>
              <td className="px-4 py-2 text-ink-soft">
                {new Date(s.validated_at).toLocaleString('fr-FR')}
              </td>
              <td className="px-4 py-2 text-right font-medium">{formatEUR(Number(s.total_ttc))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ value, label, tone }: { value: string; label: string; tone?: 'danger' }) {
  const cls = tone === 'danger' ? 'text-danger' : 'text-accent-deep';
  const border = tone === 'danger' ? 'border-danger/40' : 'border-accent-deep/40';
  return (
    <div className={`rounded-2xl border ${border} px-5 py-4 bg-white`}>
      <div className={`text-xl font-semibold tracking-tight ${cls}`}>{value}</div>
      <div className="text-xs text-ink-soft mt-1">{label}</div>
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
