'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import CustomerFormModal, { type CustomerLike } from '@/components/CustomerFormModal';
import { formatEUR } from '@/lib/services/money';

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

export default function CustomersList({ customers: initialCustomers, canWrite }: { customers: Customer[]; canWrite: boolean }) {
  const router = useRouter();
  const [customers, setCustomers] = useState(initialCustomers);
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editing, setEditing] = useState<CustomerLike | null | undefined>(undefined);

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
    <div className="p-8 space-y-5">
      <PageHeader
        title="Clients"
        subtitle="Sélectionnez un client à gauche pour afficher sa fiche complète."
        actions={canWrite ? (
          <button className="btn-primary" onClick={() => setEditing(null)}>
            + Nouveau client
          </button>
        ) : null}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Kpi label="Clients" value={customers.length.toString()} />
        <Kpi label="Pros & assoc." value={customers.filter((c) => c.type !== 'particulier').length.toString()} />
        <Kpi label="CA cumulé" value={formatEUR(customers.reduce((s, c) => s + Number(c.total_ttc), 0))} />
        <Kpi label="Avec fidélité" value={customers.filter((c) => c.loyalty_points).length.toString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-5 min-h-[60vh]">
        {/* Colonne gauche : liste */}
        <div className="space-y-3">
          <div className="card p-3 space-y-2">
            <input
              className="input"
              placeholder="Rechercher par nom, email, téléphone, SIRET…"
              value={q} onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex gap-1 flex-wrap">
              {(['all', 'particulier', 'professionnel', 'collectivite', 'association'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    type === t ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border hover:border-gray-300'
                  }`}
                >
                  {t === 'all' ? 'Tous' : TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon="◉"
              title={customers.length === 0 ? 'Aucun client' : 'Aucun résultat'}
              description={customers.length === 0
                ? "Les clients sont créés depuis la caisse à l'encaissement."
                : "Modifiez les filtres pour voir des résultats."}
            />
          ) : (
            <div className="card divide-y divide-border max-h-[60vh] overflow-auto">
              {filtered.map((c) => {
                const isActive = c.id === selectedId;
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
                    <div className="flex items-center justify-between mt-1 text-xs text-ink-soft">
                      <span className="truncate">{c.email ?? c.phone ?? '—'}</span>
                      <span className="font-medium text-ink">{formatEUR(Number(c.total_ttc))}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Colonne droite : détail ou écran vide */}
        <div>
          {!selectedId ? (
            <EmptyState
              icon="◉"
              title="Sélectionnez un client"
              description="La fiche complète (informations, historique d'achats, fidélité) apparaîtra ici."
            />
          ) : loadingDetail ? (
            <div className="card p-10 text-center text-ink-soft">Chargement…</div>
          ) : detail ? (
            <CustomerDetailPanel
              detail={detail}
              canWrite={canWrite}
              onEdit={() => setEditing(detail.customer as unknown as CustomerLike)}
            />
          ) : (
            <EmptyState icon="⚠" title="Fiche indisponible" description="Impossible de charger ce client." />
          )}
        </div>
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
    </div>
  );
}

function CustomerDetailPanel({ detail, canWrite, onEdit }: {
  detail: CustomerDetail; canWrite: boolean; onEdit: () => void;
}) {
  const c = detail.customer;
  const display = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
  const totalTtc = detail.sales.reduce((s, x) => s + Number(x.total_ttc), 0);

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{display}</h2>
            <div className="text-sm text-ink-soft mt-0.5">
              Client depuis le {new Date(c.created_at).toLocaleDateString('fr-FR')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canWrite && (
              <button onClick={onEdit} className="btn-soft text-sm">
                Modifier
              </button>
            )}
            <Link href={`/customers/${c.id}`} className="text-sm text-accent-deep hover:underline">
              Vue complète →
            </Link>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Kpi label="Achats" value={detail.sales.length.toString()} />
          <Kpi label="CA cumulé" value={formatEUR(totalTtc)} />
          <Kpi label="Fidélité" value={detail.loyalty_points != null ? `${detail.loyalty_points} pts` : '—'} />
        </div>
      </div>

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

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold">Historique d&apos;achats</h3>
          <span className="text-xs text-ink-soft">{detail.sales.length} ticket(s)</span>
        </div>
        {detail.sales.length === 0 ? (
          <div className="p-6 text-center text-ink-soft text-sm">Aucun achat enregistré.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-2">Ticket</th>
                <th className="text-left px-4 py-2">Date</th>
                <th className="text-right px-4 py-2">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {detail.sales.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{s.receipt_number}</td>
                  <td className="px-4 py-2 text-ink-soft">
                    {new Date(s.validated_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{formatEUR(Number(s.total_ttc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {c.internal_notes && (
        <div className="card p-5">
          <h3 className="font-semibold mb-2">Notes internes</h3>
          <p className="text-sm text-ink-soft whitespace-pre-wrap">{c.internal_notes}</p>
        </div>
      )}
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
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
