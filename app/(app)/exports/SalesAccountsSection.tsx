'use client';

import { useEffect, useState } from 'react';
import EmptyState from '@/components/EmptyState';
import { confirmThemed } from '@/lib/ui/dialog';
import { formatRate } from '@/lib/services/accounting-mapping';

/**
 * Plan de comptes de ventes : un compte par famille de produit, taux de TVA et
 * boutique.
 *
 * Chaque critère peut rester à « Toutes », ce qui évite d'avoir à saisir une
 * ligne par croisement : une règle large sert de socle, les cas particuliers se
 * posent par-dessus et l'emportent. C'est l'export qui applique cette règle du
 * plus spécifique, pas cet écran — il ne fait que la donner à voir.
 */

interface Row {
  id: string;
  store_id: string | null;
  category_id: string | null;
  vat_rate: number | null;
  account_code: string;
  account_label: string;
  vat_account_code: string | null;
  vat_account_label: string | null;
  store_name: string | null;
  category_name: string | null;
}

interface Ref { id: string; name: string }

/** Croisement réellement vendu, et le compte qui lui est appliqué — ou rien. */
interface Crossing {
  store_id: string | null;
  store_name: string | null;
  category_id: string | null;
  category_name: string | null;
  vat_rate: number;
  ht: number;
  account_code: string | null;
}

const TOUTES = '';

/** Valeurs pré-remplies quand on crée le compte d'un croisement précis. */
type Preset = Pick<Row, 'store_id' | 'category_id' | 'vat_rate' | 'account_label'>;

/** Premier jour du mois courant, au format ISO. */
function debutDuMois(): string {
  const t = new Date().toISOString().slice(0, 10);
  return t.slice(0, 8) + '01';
}

export default function SalesAccountsSection({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stores, setStores] = useState<Ref[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState('');
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [crossings, setCrossings] = useState<Crossing[] | null>(null);
  const [from, setFrom] = useState(debutDuMois);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  async function reload() {
    setLoading(true);
    // Les boutiques et les familles viennent d'une route comptable dédiée :
    // /api/stores et /api/categories exigent des permissions que le comptable
    // externe n'a pas, et ses listes déroulantes restaient donc vides.
    const [a, refs] = await Promise.all([
      fetch('/api/settings/accounting-accounts').then((r) => (r.ok ? r.json() : { accounts: [] })),
      fetch('/api/accounting/references')
        .then((r) => (r.ok ? r.json() : { stores: [], categories: [] }))
        .catch(() => ({ stores: [], categories: [] })),
    ]);
    setRows(a.accounts ?? []);
    setStores((refs.stores ?? []).map((x: Ref) => ({ id: x.id, name: x.name })));
    setCategories((refs.categories ?? []).map((x: Ref) => ({ id: x.id, name: x.name })));
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  /** Ce qui a été vendu sur la période, et ce qui n'a toujours pas de compte. */
  async function reloadCoverage() {
    const r = await fetch(`/api/accounting/coverage?from=${from}&to=${to}`)
      .then((x) => (x.ok ? x.json() : { crossings: [] }))
      .catch(() => ({ crossings: [] }));
    setCrossings(r.crossings ?? []);
  }
  useEffect(() => { void reloadCoverage(); }, [from, to]);

  const manquants = (crossings ?? []).filter((c) => !c.account_code);
  const couverts = (crossings ?? []).length - manquants.length;

  /**
   * Ouvre le formulaire pré-rempli sur un croisement. Le libellé suit la
   * convention du plan comptable — « PLANTES 10% PLANTE VERTE » —, le numéro
   * de compte reste à saisir : lui, personne ne peut le deviner.
   */
  function creerPour(c: Crossing) {
    setPreset({
      store_id: c.store_id,
      category_id: c.category_id,
      vat_rate: c.vat_rate,
      account_label: [c.category_name ?? 'SANS FAMILLE', `${formatRate(c.vat_rate)}%`, c.store_name ?? '']
        .filter(Boolean).join(' ').toUpperCase(),
    });
    setEditing(null);
  }

  const visible = filterStore
    // Une règle « toutes boutiques » concerne aussi la boutique filtrée : la
    // masquer donnerait l'impression qu'aucun compte ne s'applique.
    ? rows.filter((r) => r.store_id === null || r.store_id === filterStore)
    : rows;

  async function remove(r: Row) {
    if (!(await confirmThemed({
      message: `Supprimer le compte ${r.account_code} — ${r.account_label} ?`,
    }))) return;
    const res = await fetch(`/api/settings/accounting-accounts/${r.id}`, { method: 'DELETE' });
    if (res.ok) void reload();
    else setError('Suppression impossible.');
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Comptes de ventes</h2>
          <p className="mt-1 text-sm text-ink-soft max-w-2xl">
            Le compte de chaque famille de produit, par taux de TVA et par boutique.
            C&apos;est cette ventilation que reprend l&apos;export « Ventes par compte » ;
            un croisement sans règle y sort sans numéro de compte, à renseigner.
          </p>
        </div>
        {canEdit && (
          // Sur téléphone la ligne prend toute la largeur et c'est le filtre
          // qui cède la place ; le bouton, lui, garde sa taille. Sans cela il
          // se coupait en « + Nouveau / compte » sur deux lignes, et une fois
          // le libellé insécable il débordait de l'écran par la droite.
          <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
            {stores.length > 1 && (
              // `.input` vaut width:100% : sans largeur explicite, le filtre
              // s'octroyait toute la ligne et chassait le bouton hors du cadre.
              <select className="input h-10 text-sm min-w-0 flex-1 sm:flex-none sm:w-56" value={filterStore}
                      onChange={(e) => setFilterStore(e.target.value)}>
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <button className="btn-primary whitespace-nowrap shrink-0"
                    onClick={() => { setPreset(null); setEditing(null); }}>
              + Nouveau compte
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {/* Ce qui a été vendu sans compte : sans cette liste, on ne découvre les
          croisements manquants qu'en relisant le CSV exporté ligne à ligne. */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold">Croisements vendus sans compte</h3>
            <p className="mt-0.5 text-sm text-ink-soft max-w-2xl">
              Chacun produira dans l&apos;export une ligne sans numéro de compte.
              Créez-lui un compte pour qu&apos;il sorte sous le vôtre.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[11px] font-medium text-ink-soft">Du</label>
              <input type="date" className="input h-10 text-sm mt-0.5" value={from} max={to}
                     onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] font-medium text-ink-soft">Au</label>
              <input type="date" className="input h-10 text-sm mt-0.5" value={to} min={from}
                     onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>

        {crossings === null ? (
          <div className="text-sm text-ink-soft">Chargement…</div>
        ) : crossings.length === 0 ? (
          <div className="text-sm text-ink-soft">Aucune vente sur cette période.</div>
        ) : manquants.length === 0 ? (
          <div className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            ✓ Les {couverts} croisements vendus sur la période ont tous un compte.
          </div>
        ) : (
          <>
            <div className="text-sm text-ink-soft">
              {manquants.length} croisement{manquants.length > 1 ? 's' : ''} sans compte
              {couverts > 0 && <> · {couverts} déjà couvert{couverts > 1 ? 's' : ''}</>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-ink-soft border-b border-border">
                    <Th>Famille</Th><Th>Taux</Th><Th>Boutique</Th><Th>CA HT</Th><Th />
                  </tr>
                </thead>
                <tbody>
                  {manquants.map((c) => (
                    <tr key={`${c.store_id}|${c.category_id}|${c.vat_rate}`}
                        className="border-b border-border last:border-0">
                      <Td>{c.category_name ?? <span className="text-ink-soft italic">Sans famille</span>}</Td>
                      <Td>{formatRate(c.vat_rate)} %</Td>
                      <Td>{c.store_name ?? '—'}</Td>
                      <Td><span className="tabular-nums">{c.ht.toFixed(2)} €</span></Td>
                      <Td>
                        {canEdit && (
                          <div className="flex justify-end">
                            <button className="btn-soft text-xs h-8 px-3" onClick={() => creerPour(c)}>
                              Créer le compte
                            </button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-ink-soft text-sm">Chargement…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="◊"
          title="Aucun compte paramétré"
          description="Sans règle, tout est regroupé sur le compte de ventes global. Ajoutez un compte par famille pour obtenir la ventilation attendue par votre comptable."
          action={canEdit ? <button className="btn-primary" onClick={() => { setPreset(null); setEditing(null); }}>+ Créer le premier</button> : undefined}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-soft border-b border-border">
                <Th>Compte ventes</Th><Th>Libellé</Th><Th>Compte TVA</Th><Th>Boutique</Th><Th>Famille</Th><Th>Taux</Th><Th />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50/60">
                  <Td><span className="font-mono">{r.account_code}</span></Td>
                  <Td>{r.account_label}</Td>
                  <Td>
                    {r.vat_account_code
                      ? <span className="font-mono">{r.vat_account_code}</span>
                      : <span className="text-ink-soft italic">Aucun</span>}
                  </Td>
                  <Td>{r.store_name ?? <Toutes />}</Td>
                  <Td>{r.category_name ?? <Toutes />}</Td>
                  <Td>{r.vat_rate === null ? <Toutes /> : `${formatRate(r.vat_rate)} %`}</Td>
                  <Td>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <button className="btn-ghost text-xs h-8 px-2" onClick={() => setEditing(r)}>Modifier</button>
                        <button className="btn-ghost text-xs h-8 px-2 text-danger" onClick={() => void remove(r)}>Supprimer</button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing !== undefined && (
        <AccountForm
          row={editing}
          preset={preset}
          stores={stores}
          categories={categories}
          onClose={() => { setEditing(undefined); setPreset(null); }}
          onSaved={() => {
            setEditing(undefined); setPreset(null);
            void reload(); void reloadCoverage();
          }}
        />
      )}
    </section>
  );
}

function Toutes() {
  return <span className="text-ink-soft italic">Toutes</span>;
}
function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-3 py-2.5 align-middle">{children}</td>;
}

function AccountForm({ row, preset, stores, categories, onClose, onSaved }: {
  row: Row | null;
  /** Croisement de départ, quand on crée le compte d'une ligne manquante. */
  preset?: Preset | null;
  stores: Ref[];
  categories: Ref[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const base = row ?? preset ?? null;
  const [form, setForm] = useState({
    store_id: base?.store_id ?? TOUTES,
    category_id: base?.category_id ?? TOUTES,
    vat_rate: base?.vat_rate == null ? '' : String(base.vat_rate),
    account_code: row?.account_code ?? '',
    account_label: base?.account_label ?? '',
    vat_account_code: row?.vat_account_code ?? '',
    vat_account_label: row?.vat_account_label ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Le compte de TVA est l'exception, pas la règle : la plupart des comptes de
  // ventes se contentent du compte global du taux. On ne montre les deux champs
  // qu'à qui en veut un — et on les rouvre d'office sur une règle qui en porte
  // déjà un, pour qu'il reste modifiable.
  const [withVat, setWithVat] = useState(
    !!(row?.vat_account_code || row?.vat_account_label),
  );

  async function submit() {
    setSaving(true); setError(null);
    const payload = {
      store_id: form.store_id || null,
      category_id: form.category_id || null,
      vat_rate: form.vat_rate.trim() === '' ? null : Number(form.vat_rate.replace(',', '.')),
      account_code: form.account_code.trim(),
      account_label: form.account_label.trim(),
      // Case décochée = pas de compte de TVA, même si les champs gardaient une
      // saisie abandonnée : c'est la case qui fait foi, pas ce qu'elle masque.
      vat_account_code: withVat ? form.vat_account_code.trim() || null : null,
      vat_account_label: withVat ? form.vat_account_label.trim() || null : null,
    };
    const res = row
      ? await fetch(`/api/settings/accounting-accounts/${row.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/settings/accounting-accounts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Enregistrement impossible.');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card w-full max-w-xl p-6 my-8 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{row ? 'Modifier le compte' : 'Nouveau compte'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Fermer">✕</button>
        </div>

        <p className="text-sm text-ink-soft">
          Laissez un critère sur « Toutes » pour qu&apos;il ne restreigne pas la règle.
          Entre deux règles applicables, c&apos;est la plus précise qui l&apos;emporte.
          Le compte de ventes reçoit le HT ; la taxe part sur le compte de TVA si
          vous en indiquez un.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="N° de compte">
            <input className="input font-mono" value={form.account_code}
                   onChange={(e) => setForm({ ...form, account_code: e.target.value })}
                   placeholder="70731200" />
          </Field>
          <Field label="Taux de TVA (%)">
            <input className="input" value={form.vat_rate}
                   onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}
                   placeholder="Toutes" />
          </Field>
          <Field label="Libellé" full>
            <input className="input" value={form.account_label}
                   onChange={(e) => setForm({ ...form, account_label: e.target.value })}
                   placeholder="PLANTES 10% PLANTES VERTE" />
          </Field>
          <Field label="Boutique">
            <select className="input" value={form.store_id}
                    onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
              <option value={TOUTES}>Toutes</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Famille de produit">
            <select className="input" value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value={TOUTES}>Toutes</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <div className="col-span-2 pt-1">
            <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer select-none">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]"
                     checked={withVat} onChange={(e) => setWithVat(e.target.checked)} />
              Ajouter un compte de TVA collectée
            </label>
          </div>

          {withVat && (
            <>
              <Field label="Compte de TVA collectée">
                <input className="input font-mono" value={form.vat_account_code}
                       onChange={(e) => setForm({ ...form, vat_account_code: e.target.value })}
                       placeholder="44571200" />
              </Field>
              <Field label="Libellé du compte de TVA">
                <input className="input" value={form.vat_account_label}
                       onChange={(e) => setForm({ ...form, vat_account_label: e.target.value })}
                       placeholder="TVA collectée 10 %" />
              </Field>
            </>
          )}
        </div>

        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button className="btn-primary" disabled={saving || !form.account_code.trim() || !form.account_label.trim()}
                  onClick={() => void submit()}>
            {saving ? 'Enregistrement…' : (row ? 'Enregistrer' : 'Créer')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-sm font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
