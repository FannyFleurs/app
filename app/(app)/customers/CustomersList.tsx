'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmThemed } from '@/lib/ui/dialog';
import { useRouter, useSearchParams } from 'next/navigation';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import CustomerFormModal, { type CustomerLike } from '@/components/CustomerFormModal';
import CustomerImportModal from './CustomerImportModal';
import PageHeader from '@/components/PageHeader';
import { formatEUR } from '@/lib/services/money';
import WalletActions from './[id]/WalletActions';
import LoyaltyPanel from './[id]/LoyaltyPanel';

// Sur la caisse, on solde un compte via la page d'encaissement générale (mêmes
// modes, dont le bon d'achat), pour que le règlement compte dans la journée
// (CB, espèces…). Chargée à la demande : lourde et inutile au back-office.
const PaymentModal = dynamic(() => import('../caisse/PaymentModal'), { ssr: false });

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
  archived_at?: string | null;
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
    email: string | null; phone: string | null; siret: string | null; siren: string | null;
    vat_number: string | null;
    public_service_code: string | null; commitment_number: string | null;
    address: { line1?: string; zip?: string; city?: string; country?: string } | null;
    consent_email: boolean; consent_sms: boolean;
    internal_notes: string | null; loyalty_code: string | null;
    created_at: string;
    archived_at?: string | null;
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
  | 'avoirs'
  | 'fidelite'
  | 'bons-achats';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard',    label: 'Dashboard' },
  { key: 'informations', label: 'Informations' },
  { key: 'commentaires', label: 'Commentaires' },
  // Intitulés courts : « Liste des » se répétait d'un onglet à l'autre sans
  // rien distinguer, et poussait le dernier onglet hors de la barre.
  { key: 'tickets',      label: 'Tickets' },
  { key: 'achats',       label: 'Achats' },
  { key: 'avoirs',       label: 'Avoirs' },
  { key: 'fidelite',     label: 'Fidélité' },
  { key: 'bons-achats',  label: 'Bons d\'achats' },
];

export default function CustomersList({ customers: initialCustomers, total, canWrite }: { customers: Customer[]; total: number; canWrite: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState(initialCustomers);
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => { setCustomers(initialCustomers); }, [initialCustomers]);
  const [q, setQ] = useState('');
  const [serverResults, setServerResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [type, setType] = useState<'all' | string>('all');
  // Les fiches archivées sortent de la liste et des recherches : cette bascule
  // est le seul endroit d'où on les revoit, pour en remettre une en service.
  const [showArchived, setShowArchived] = useState(false);
  // Incrémenté après un archivage : la liste de gauche vient du serveur, il
  // faut la redemander pour que la fiche rangée en disparaisse (ou y revienne).
  const [tick, setTick] = useState(0);
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

  // Recherche serveur : au-delà de 2 caractères, on interroge l'API pour
  // couvrir TOUS les clients. La liste initiale est plafonnée aux 200 plus
  // récents (par activité) : les clients importés sans vente n'y figurent pas
  // forcément, d'où l'impossibilité de les retrouver sans cette recherche.
  useEffect(() => {
    const needle = q.trim();
    // Vue « Archivés » : la liste initiale rendue par le serveur ne contient
    // que des fiches actives, il faut donc toujours interroger l'API, même
    // sans recherche.
    if (needle.length < 2 && !showArchived) { setServerResults(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      const p = new URLSearchParams({ limit: '200' });
      if (needle.length >= 2) p.set('q', needle);
      if (showArchived) p.set('archived', 'only');
      void fetch(`/api/customers?${p.toString()}`)
        .then((r) => (r.ok ? r.json() : { customers: [] }))
        .then((j) => {
          if (cancelled) return;
          const rows: Customer[] = ((j.customers ?? []) as Record<string, unknown>[]).map((c) => ({
            id: String(c.id), type: String(c.type ?? 'particulier'),
            display_name: String(c.display_name ?? ''),
            email: (c.email as string) ?? null, phone: (c.phone as string) ?? null,
            company_name: (c.company_name as string) ?? null, siret: (c.siret as string) ?? null,
            nb_sales: '0', last_visit: null, total_ttc: '0',
            loyalty_points: null, default_discount_pct: (c.default_discount_pct as string) ?? null,
            archived_at: (c.archived_at as string) ?? null,
          }));
          setServerResults(rows);
        })
        .catch(() => { if (!cancelled) setServerResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, showArchived, tick]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const usingServer = (needle.length >= 2 || showArchived) && serverResults != null;
    // Sans résultat serveur en vue « Archivés », on n'affiche RIEN plutôt que
    // la liste des fiches actives : ce serait un contresens.
    const source = usingServer ? serverResults! : showArchived ? [] : customers;
    return source.filter((c) => {
      if (type !== 'all' && c.type !== type) return false;
      if (usingServer || !needle) return true;
      return (
        c.display_name?.toLowerCase().includes(needle) ||
        c.email?.toLowerCase().includes(needle) ||
        c.phone?.includes(needle) ||
        c.company_name?.toLowerCase().includes(needle) ||
        c.siret?.includes(needle)
      );
    });
  }, [customers, serverResults, q, type, showArchived]);

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
      <div className="flex flex-col md:h-full md:overflow-hidden">
        <div className="px-6 md:px-8 pt-6 md:pt-8 pb-4 shrink-0 border-b border-border">
          <PageHeader
            title="Comptes clients"
            subtitle="Fiches clients, fidélité et historique d'achat."
            actions={
              <div className="flex items-center gap-3">
                {canWrite && (
                  <button
                    onClick={() => setImportOpen(true)}
                    className="btn-soft h-9 px-3 text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                    title="Importer des clients depuis un fichier Excel"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 12 4-4m-4 4-4-4M4 21h16"/></svg>
                    Importer
                  </button>
                )}
                <span className="text-sm text-ink-soft whitespace-nowrap">{total} clients</span>
              </div>
            }
          />
        </div>
        {/* Deux colonnes : la liste, et la fiche. La navigation de la fiche
            était une troisième colonne de 240 px, qui prenait autant de place
            que sept mots et rognait d'autant le contenu — elle est passée en
            onglets au-dessus de la fiche. */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_3fr] md:overflow-hidden">
        {/* COLONNE 1 — Liste clients */}
        <aside className="border-r border-border bg-white flex flex-col overflow-hidden">
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
            <label className="flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); setSelectedId(null); setDetail(null); }}
              />
              Fiches archivées
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-ink-soft text-sm">
                {searching ? 'Recherche…'
                  : showArchived ? 'Aucune fiche archivée.'
                  : customers.length === 0 ? 'Aucun client.' : 'Aucun résultat.'}
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
                        <Badge tone={c.archived_at ? 'warning' : 'neutral'}>
                          {c.archived_at ? 'Archivé' : (TYPE_LABEL[c.type] ?? c.type)}
                        </Badge>
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

        {/* COLONNE 2 — Fiche client */}
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
              onTabChange={setTab}
              detail={detail}
              canWrite={canWrite}
              onEdit={() => setEditing(detail.customer as unknown as CustomerLike)}
              onReload={() => void selectCustomer(detail.customer.id)}
              onArchived={() => {
                setTick((t) => t + 1);
                router.refresh();
                void selectCustomer(detail.customer.id);
              }}
            />
          )}
        </main>
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

      {importOpen && (
        <CustomerImportModal
          onClose={() => setImportOpen(false)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );
}

function CustomerDetailContent({ tab, onTabChange, detail, canWrite, onEdit, onReload, onArchived }: {
  tab: Tab; onTabChange: (t: Tab) => void;
  detail: CustomerDetail; canWrite: boolean;
  onEdit: () => void; onReload: () => void; onArchived: () => void;
}) {
  const c = detail.customer;
  const archived = !!c.archived_at;
  const [archiving, setArchiving] = useState(false);

  /**
   * Range la fiche (ou la remet en service). Rien n'est supprimé : les
   * tickets et factures du client restent attachés à cette fiche, elle cesse
   * seulement de remonter dans les recherches — le geste qu'appellent les
   * doublons.
   */
  async function toggleArchive() {
    const suivant = !archived;
    if (suivant && !(await confirmThemed({
      title: `Archiver « ${c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'ce client'} »`,
      confirmLabel: 'Archiver',
      message: 'La fiche sortira des recherches clients, en caisse comme au back-office. '
        + 'Son historique est conservé, et vous pourrez la remettre en service à tout moment '
        + 'depuis le filtre « Fiches archivées ».',
    }))) return;
    setArchiving(true);
    const r = await fetch(`/api/customers/${c.id}/archive`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: suivant }),
    });
    setArchiving(false);
    if (r.ok) onArchived();
  }

  const display = c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Client';
  const totalTtc = detail.sales.reduce((s, x) => s + Number(x.total_ttc), 0);
  const avg = detail.sales.length > 0 ? totalTtc / detail.sales.length : 0;
  const lastVisit = detail.sales[0]?.validated_at;
  const [balances, setBalances] = useState<{
    account_balance: number;
    gift_card_balance: number;
    credit_notes_balance: number;
  }>({ account_balance: 0, gift_card_balance: 0, credit_notes_balance: 0 });

  const loadBalances = useCallback(() => {
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

  useEffect(() => {
    setBalances({ account_balance: 0, gift_card_balance: 0, credit_notes_balance: 0 });
    loadBalances();
  }, [c.id, loadBalances]);
  const accountDue = balances.account_balance < 0 ? -balances.account_balance : 0;

  const [settleOpen, setSettleOpen] = useState(false);
  // Boutique de caisse active sur ce poste : sa présence signale qu'on est « sur
  // caisse » (et fournit la boutique où rattacher l'encaissement). Absente au
  // back-office, où l'on garde le règlement déclaratif.
  const [caisseStoreId, setCaisseStoreId] = useState<string | null>(null);
  useEffect(() => {
    try { setCaisseStoreId(localStorage.getItem('webpos_current_store_id')); } catch { /* pas de storage */ }
  }, []);

  return (
    <div className="pb-6">
      {/* Identité et onglets collés en haut : sur les listes longues (tickets,
          achats), on garde sous les yeux de qui l'on parle et par où passer. */}
      <div className="sticky top-0 z-10 bg-white border-b border-border">
        <div className="px-4 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight truncate">{display}</h2>
              {archived && <Badge tone="warning">Archivé</Badge>}
            </div>
            <div className="text-sm text-ink-soft mt-0.5">
              {archived
                ? <>Fiche archivée le {new Date(c.archived_at!).toLocaleDateString('fr-FR')} — invisible dans les recherches</>
                : lastVisit
                ? <>Dernière visite le {new Date(lastVisit).toLocaleDateString('fr-FR')}</>
                : <>Client depuis le {new Date(c.created_at).toLocaleDateString('fr-FR')}</>
              }
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canWrite && (
              <button onClick={() => void toggleArchive()} disabled={archiving}
                      className="btn-soft text-sm whitespace-nowrap"
                      title={archived
                        ? 'Remettre cette fiche dans les recherches'
                        : 'Retirer cette fiche des recherches (doublon)'}>
                {archiving ? '…' : archived ? 'Désarchiver' : 'Archiver'}
              </button>
            )}
            {canWrite && (
              <button onClick={onEdit} className="btn-primary text-sm whitespace-nowrap">
                Modifier client
              </button>
            )}
          </div>
        </div>
        {/* Onglets défilables plutôt que repliés : sept intitulés ne tiennent
            pas sur une tablette, et un menu « … » cacherait la moitié de la
            fiche derrière un clic de plus. */}
        <div className="px-4 sm:px-6 flex gap-1 overflow-x-auto no-scrollbar" role="tablist">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.key)}
                className={`relative shrink-0 whitespace-nowrap px-2.5 lg:px-3 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  active
                    ? 'border-accent text-accent-deep'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-5 space-y-5">
      {tab === 'dashboard' && (
        <div className="space-y-3">
          {accountDue > 0 && (
            <div className="card p-4 flex items-center justify-between gap-3 bg-danger/5 border border-danger/20">
              <div>
                <div className="text-sm font-semibold text-danger">Solde en compte à régler</div>
                <div className="text-2xl font-semibold tracking-tight text-danger">{formatEUR(accountDue)}</div>
              </div>
              {canWrite && (
                <button className="btn-primary" onClick={() => setSettleOpen(true)}>
                  Solder le compte
                </button>
              )}
            </div>
          )}
          {/* La fiche a gagné la largeur de l'ancienne colonne de menu : les
              chiffres s'y rangent en trois ou quatre au lieu de deux. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
            <Tile value={formatEUR(totalTtc)}                       label="Total des achats" />
            <Tile value={formatEUR(accountDue)}                     label="Montant dû (en compte)"
                  tone={accountDue > 0 ? 'danger' : undefined} />
            <Tile value={detail.sales.length.toString()}            label="Nombre de passages" />
            <Tile value={formatEUR(avg)}                            label="Ticket moyen TTC" />
            <Tile value={formatEUR(balances.credit_notes_balance)}  label="Crédits à dépenser" />
            <Tile value={formatEUR(balances.gift_card_balance)}     label="Bons cadeaux à dépenser" />
            <Tile value={formatEUR(detail.loyalty_points ?? 0)}     label="Solde fidélité" />
          </div>
        </div>
      )}

      {settleOpen && (
        caisseStoreId ? (
          // Sur caisse : la page d'encaissement générale. Le règlement passe par
          // les vrais modes (dont le bon d'achat) et entre dans la journée.
          <PaymentModal
            saleId=""
            totalTtc={accountDue}
            storeId={caisseStoreId}
            settlement={{ customerId: c.id }}
            onClose={() => setSettleOpen(false)}
            onValidated={() => {}}
            onSettled={() => { setSettleOpen(false); loadBalances(); }}
          />
        ) : (
          <SettleAccountModal
            customerId={c.id}
            due={accountDue}
            onClose={() => setSettleOpen(false)}
            onDone={() => { setSettleOpen(false); loadBalances(); }}
          />
        )
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
                  <Item label="SIREN" value={c.siren ?? '—'} />
                  <Item label="SIRET" value={c.siret ?? '—'} />
                  <Item label="TVA intra." value={c.vat_number ?? '—'} />
                </>
              )}
              {c.type === 'collectivite' && (
                <>
                  <Item label="Code service (Chorus Pro)" value={c.public_service_code ?? '—'} />
                  <Item label="N° d'engagement" value={c.commitment_number ?? '—'} />
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
      {tab === 'avoirs'  && <CreditNotesTable customerId={c.id} />}

      {tab === 'fidelite' && (
        <div className="space-y-3">
          <LoyaltyPanel customerId={c.id} onChanged={onReload} />
          <WalletActions
            customerId={c.id}
            customerEmail={c.email}
            customerPhone={c.phone}
          />
        </div>
      )}

      {tab === 'bons-achats' && (
        <div className="card p-5 text-sm text-ink-soft">
          Les cartes cadeaux et bons d&apos;achat de ce client se gèrent dans
          l&apos;onglet <span className="font-medium text-ink">Fidélité</span>.
        </div>
      )}
      </div>
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

interface CreditNote {
  id: string; number: string; created_at: string;
  amount: number; used_amount: number; remaining: number;
  status: string; reason: string | null; receipt_number: string | null;
}

const CREDIT_STATUS: Record<string, { label: string; tone: 'success' | 'soft' | 'warning' | 'neutral' }> = {
  open: { label: 'Disponible', tone: 'success' },
  partially_used: { label: 'Partiel', tone: 'warning' },
  used: { label: 'Épuisé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
  pending: { label: 'En attente', tone: 'soft' },
};

/**
 * Les avoirs du client : ceux émis lors d'une reprise de produit sur l'une de
 * ses ventes, comme ceux créés directement à son nom. La colonne « Reste »
 * dit ce qu'il peut encore dépenser ; le numéro ouvre le PDF de l'avoir.
 */
function CreditNotesTable({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetch(`/api/customers/${customerId}/credit-notes`)
      .then((r) => (r.ok ? r.json() : { credit_notes: [] }))
      .then((j) => setRows(j.credit_notes ?? []))
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="card p-8 text-center text-ink-soft text-sm">Chargement…</div>;
  if (rows.length === 0) {
    return <div className="card p-8 text-center text-ink-soft text-sm">Aucun avoir pour ce client.</div>;
  }
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[40rem]">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Avoir</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Ticket d&apos;origine</th>
              <th className="text-right px-4 py-3 font-semibold">Montant</th>
              <th className="text-right px-4 py-3 font-semibold">Reste</th>
              <th className="text-center px-4 py-3 font-semibold">État</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cn) => {
              const st = CREDIT_STATUS[cn.status] ?? { label: cn.status, tone: 'neutral' as const };
              return (
                <tr key={cn.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    <a href={`/api/credit-notes/${cn.id}/pdf`} target="_blank" rel="noreferrer"
                       className="text-accent-deep hover:underline">
                      {cn.number}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-ink-soft text-xs">
                    {new Date(cn.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{cn.receipt_number ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatEUR(cn.amount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{formatEUR(cn.remaining)}</td>
                  <td className="px-4 py-2 text-center"><Badge tone={st.tone}>{st.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
                  ? <Link href={`/ma-journee?date=${s.validated_at.slice(0, 10)}&sale=${s.id}`} className="text-accent-deep hover:underline">{s.receipt_number}</Link>
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

interface PayMethod { kind: string; label: string; is_active: boolean; position: number }
// Modes non pertinents pour solder un compte (pas d'encaissement réel ici).
const SETTLE_EXCLUDED = new Set(['deferred', 'payment_link']);

function SettleAccountModal({ customerId, due, onClose, onDone }: {
  customerId: string; due: number; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState(due.toFixed(2));
  const [method, setMethod] = useState<string | null>(null);
  const [methods, setMethods] = useState<PayMethod[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modes de règlement configurés pour la boutique (comme en caisse).
  useEffect(() => {
    void fetch('/api/payment-methods')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = ((j?.methods ?? []) as PayMethod[])
          .filter((m) => m.is_active && !SETTLE_EXCLUDED.has(m.kind))
          .sort((a, b) => a.position - b.position);
        setMethods(list);
        setMethod(list.find((m) => m.kind === 'cash')?.kind ?? list[0]?.kind ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function confirm() {
    const val = Number(amount.replace(',', '.'));
    if (!(val > 0)) { setError('Montant invalide.'); return; }
    if (!method) { setError('Choisissez un mode de règlement.'); return; }
    setBusy(true); setError(null);
    // Boutique courante du poste : permet de rattacher l'entrée d'espèces à la
    // bonne caisse ouverte (pour le comptage de fin de journée).
    const storeId = (typeof window !== 'undefined'
      ? localStorage.getItem('webpos_current_store_id')
      : null) || undefined;
    const r = await fetch(`/api/customers/${customerId}/settle-account`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: val, method, store_id: storeId }),
    });
    setBusy(false);
    if (r.ok) {
      onDone();
    } else {
      // Ex. : espèces alors qu'aucune caisse n'est ouverte → opération refusée,
      // rien n'est enregistré. On garde la modale ouverte avec le motif.
      const j = await r.json().catch(() => null);
      setError(j?.message ?? 'Échec du règlement.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="card w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Solder le compte</h3>
        <p className="text-sm text-ink-soft">
          Montant dû : <strong>{formatEUR(due)}</strong>. Ajustez si le règlement diffère.
        </p>
        <label className="block text-sm">
          <span className="text-ink-soft">Montant réglé (€)</span>
          <input
            autoFocus className="input h-11 w-full mt-1 text-right tabular-nums" inputMode="decimal"
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <div className="text-sm">
          <span className="text-ink-soft">Mode de règlement</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {methods.map((m) => (
              <button
                key={m.kind}
                type="button"
                aria-pressed={method === m.kind}
                onClick={() => setMethod(m.kind)}
                className={`h-11 rounded-xl border px-3 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
                  method === m.kind
                    ? 'border-transparent text-white shadow-sm'
                    : 'border-border hover:bg-gray-50 text-ink'
                }`}
                style={method === m.kind ? { backgroundColor: 'var(--primary)' } : undefined}
              >
                {method === m.kind && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {m.label}
              </button>
            ))}
            {methods.length === 0 && <p className="text-xs text-ink-soft col-span-2">Aucun mode de règlement configuré.</p>}
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary h-10 px-4" disabled={busy} onClick={onClose}>Annuler</button>
          <button className="btn-primary h-10 px-4" disabled={busy || !method} onClick={() => void confirm()}>
            {busy ? '…' : 'Marquer comme payé'}
          </button>
        </div>
      </div>
    </div>
  );
}
