'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';

interface Org {
  name: string; legal_name: string; siret: string | null; siren: string | null; vat_number: string | null;
  address: { line1?: string; line2?: string; zip?: string; city?: string; country?: string } | null;
  contact: { phone?: string; email?: string; website?: string } | null;
}

interface Store {
  id: string; code: string; name: string;
  address: { line1?: string; zip?: string; city?: string } | null;
  is_active: boolean;
}

interface Register {
  id: string; code: string; name: string; store_id: string; store_name: string;
  is_active: boolean;
  device_id: string | null; device_name: string | null; bound_at: string | null;
}

interface TaxRate {
  id: string; code: string; label: string; rate: string;
  is_default: boolean; is_active: boolean;
}

type Tab = 'identity' | 'stores' | 'registers' | 'tax';

export default function CompanyAdmin({
  org: initialOrg, canWrite, planLabel, maxStores, maxRegistersPerStore,
  canBuyExtraRegister = false, extraRegisterPrice = '9',
}: {
  org: Org; canWrite: boolean;
  planLabel: string;
  maxStores: number | null;
  maxRegistersPerStore: number | null;
  canBuyExtraRegister?: boolean;
  extraRegisterPrice?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('identity');
  const [org, setOrg] = useState<Org>(initialOrg);
  const [stores, setStores] = useState<Store[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  async function reload() {
    const [s, r, t] = await Promise.all([
      fetch('/api/stores').then((x) => x.ok ? x.json() : { stores: [] }),
      fetch('/api/registers').then((x) => x.ok ? x.json() : { registers: [] }),
      fetch('/api/tax-rates').then((x) => x.ok ? x.json() : { tax_rates: [] }),
    ]);
    setStores(s.stores ?? []);
    setRegisters(r.registers ?? []);
    setTaxRates(t.tax_rates ?? []);
  }
  useEffect(() => { void reload(); }, []);

  return (
    <div className="p-8 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Société &amp; boutiques</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Identité légale, boutiques, caisses et taux de TVA.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === 'identity'}     onClick={() => setTab('identity')}>Identité</TabButton>
        <TabButton active={tab === 'stores'}       onClick={() => setTab('stores')}>Boutiques ({stores.length})</TabButton>
        <TabButton active={tab === 'registers'}    onClick={() => setTab('registers')}>Caisses ({registers.length})</TabButton>
        <TabButton active={tab === 'tax'}          onClick={() => setTab('tax')}>Taux de TVA ({taxRates.length})</TabButton>
      </div>

      {tab === 'identity' && (
        <IdentityForm org={org} canWrite={canWrite} onSaved={(o) => { setOrg(o); router.refresh(); }} />
      )}
      {tab === 'stores' && (
        <StoresPanel stores={stores} canWrite={canWrite} onChange={() => void reload()}
                     planLabel={planLabel} maxStores={maxStores} />
      )}
      {tab === 'registers' && (
        <RegistersPanel registers={registers} stores={stores} canWrite={canWrite} onChange={() => void reload()}
                        planLabel={planLabel} maxRegistersPerStore={maxRegistersPerStore}
                        canBuyExtraRegister={canBuyExtraRegister} extraRegisterPrice={extraRegisterPrice} />
      )}
      {tab === 'tax' && (
        <TaxPanel taxRates={taxRates} canWrite={canWrite} onChange={() => void reload()} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-accent text-accent-deep' : 'border-transparent text-ink-soft hover:text-ink'
      }`}
      style={active ? { borderColor: 'var(--primary)' } : undefined}
    >
      {children}
    </button>
  );
}

function IdentityForm({ org, canWrite, onSaved }: {
  org: Org; canWrite: boolean; onSaved: (o: Org) => void;
}) {
  const [form, setForm] = useState<Org>(org);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null); setSaved(false);
    const r = await fetch('/api/organization', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        legal_name: form.legal_name,
        siret: form.siret || null,
        siren: form.siren || null,
        vat_number: form.vat_number || null,
        address: form.address ?? {},
        contact: form.contact ?? {},
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setSaved(true);
    onSaved(form);
    setTimeout(() => setSaved(false), 2500);
  }

  function setAddr<K extends keyof NonNullable<Org['address']>>(k: K, v: string) {
    setForm((s) => ({ ...s, address: { ...(s.address ?? {}), [k]: v } }));
  }
  function setContact<K extends keyof NonNullable<Org['contact']>>(k: K, v: string) {
    setForm((s) => ({ ...s, contact: { ...(s.contact ?? {}), [k]: v } }));
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="card p-5">
        <h3 className="font-semibold mb-3">Identité légale</h3>
        <div className="space-y-3">
          <Field label="Nom commercial">
            <input className="input" value={form.name} disabled={!canWrite}
                   onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Raison sociale">
            <input className="input" value={form.legal_name} disabled={!canWrite}
                   onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SIREN">
              <input className="input" value={form.siren ?? ''} disabled={!canWrite} maxLength={11}
                     placeholder="9 chiffres"
                     onChange={(e) => setForm({ ...form, siren: e.target.value.replace(/\s/g, '') })} />
            </Field>
            <Field label="SIRET">
              <input className="input" value={form.siret ?? ''} disabled={!canWrite} maxLength={17}
                     placeholder="14 chiffres"
                     onChange={(e) => setForm({ ...form, siret: e.target.value.replace(/\s/g, '') })} />
            </Field>
          </div>
          <Field label="N° TVA intra.">
            <input className="input" value={form.vat_number ?? ''} disabled={!canWrite}
                   onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3">Coordonnées</h3>
        <div className="space-y-3">
          <Field label="Adresse">
            <input className="input" placeholder="N°, rue"
                   value={form.address?.line1 ?? ''} disabled={!canWrite}
                   onChange={(e) => setAddr('line1', e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code postal">
              <input className="input" value={form.address?.zip ?? ''} disabled={!canWrite}
                     onChange={(e) => setAddr('zip', e.target.value)} />
            </Field>
            <Field label="Ville" colSpan={2}>
              <input className="input" value={form.address?.city ?? ''} disabled={!canWrite}
                     onChange={(e) => setAddr('city', e.target.value)} />
            </Field>
          </div>
          <Field label="Téléphone">
            <input className="input" value={form.contact?.phone ?? ''} disabled={!canWrite}
                   onChange={(e) => setContact('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className="input" value={form.contact?.email ?? ''} disabled={!canWrite}
                   onChange={(e) => setContact('email', e.target.value)} />
          </Field>
        </div>
      </div>

      {error && <div className="md:col-span-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="md:col-span-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">✓ Enregistré</div>}

      {canWrite && (
        <div className="md:col-span-2">
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}

function StoresPanel({ stores, canWrite, onChange, planLabel, maxStores }: {
  stores: Store[]; canWrite: boolean; onChange: () => void;
  planLabel: string; maxStores: number | null;
}) {
  const [editing, setEditing] = useState<Store | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<string | null>(null);
  const atLimit = maxStores !== null && stores.length >= maxStores;

  async function remove(s: Store) {
    if (!confirm(`Supprimer définitivement la boutique « ${s.name} » et ses caisses ?\n\nImpossible si des ventes y sont enregistrées.`)) return;
    setDeleting(s.id);
    try {
      const r = await fetch(`/api/stores/${s.id}`, { method: 'DELETE' });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.message ?? j.error ?? 'Suppression impossible.');
        return;
      }
      onChange();
    } finally {
      setDeleting(null);
    }
  }

  // Réactive une boutique désactivée (sa caisse redevient sélectionnable).
  async function reactivate(s: Store) {
    setDeleting(s.id);
    try {
      const r = await fetch(`/api/stores/${s.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.message ?? j.error ?? 'Réactivation impossible.');
        return;
      }
      onChange();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="space-y-2">
          <button onClick={() => setEditing(null)} className="btn-primary" disabled={atLimit}>
            + Ajouter une boutique
          </button>
          {atLimit && (
            <p className="text-xs text-ink-soft">
              Votre offre <strong>{planLabel}</strong> est limitée à {maxStores} boutique(s).
              {' '}<a href="/settings/subscription" className="text-accent-deep underline">Changer d&apos;offre</a>.
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {stores.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{s.name}</span>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">{s.code}</Badge>
                {!s.is_active && <Badge tone="warning">Désactivée</Badge>}
              </div>
            </div>
            <div className="mt-2 text-sm text-ink-soft">
              {[s.address?.line1, s.address?.zip, s.address?.city].filter(Boolean).join(' ') || '—'}
            </div>
            {canWrite && (
              <div className="mt-3 flex items-center gap-3">
                <button onClick={() => setEditing(s)} className="text-xs text-accent-deep hover:underline">
                  Modifier
                </button>
                {!s.is_active && (
                  <button
                    onClick={() => void reactivate(s)}
                    disabled={deleting === s.id}
                    className="text-xs text-success hover:underline disabled:opacity-50 font-medium"
                  >
                    {deleting === s.id ? '…' : 'Réactiver'}
                  </button>
                )}
                {stores.length > 1 && (
                  <button
                    onClick={() => void remove(s)}
                    disabled={deleting === s.id}
                    className="text-xs text-danger hover:underline disabled:opacity-50"
                  >
                    {deleting === s.id ? 'Suppression…' : 'Supprimer'}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {editing !== undefined && (
        <StoreFormModal
          store={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); onChange(); }}
        />
      )}
    </div>
  );
}

function StoreFormModal({ store, onClose, onSaved }: {
  store: Store | null; onClose: () => void; onSaved: () => void;
}) {
  const [code, setCode] = useState(store?.code ?? '');
  const [name, setName] = useState(store?.name ?? '');
  const [line1, setLine1] = useState(store?.address?.line1 ?? '');
  const [zip, setZip] = useState(store?.address?.zip ?? '');
  const [city, setCity] = useState(store?.address?.city ?? '');
  const [isActive, setIsActive] = useState(store?.is_active ?? true);
  // Admin de la boutique (creation uniquement) : mot de passe pour le
  // back-office + PIN pour la caisse. Rattache a la nouvelle boutique.
  const [addAdmin, setAddAdmin] = useState(!store);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPin, setAdminPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setError('Nom obligatoire.'); return; }
    // Validation admin boutique (creation + case cochee).
    if (!store && addAdmin) {
      if (!adminName.trim() || !adminEmail.trim()) {
        setError('Admin boutique : nom et email obligatoires.'); return;
      }
      if (adminPassword.length < 8) {
        setError('Admin boutique : mot de passe de 8 caractères minimum.'); return;
      }
      if (!/^\d{4}$/.test(adminPin)) {
        setError('Admin boutique : PIN de 4 chiffres obligatoire.'); return;
      }
    }
    setSaving(true); setError(null);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      address: { line1: line1.trim(), zip: zip.trim(), city: city.trim(), country: 'FR' },
      ...(store ? { is_active: isActive } : {}),
    };
    // Code : uniquement transmis si l'utilisateur en a saisi un (mode
    // avance). Sinon le serveur genere B1, B2… automatiquement.
    if (code.trim()) payload.code = code.trim();
    const r = store
      ? await fetch(`/api/stores/${store.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/stores', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
    if (!r.ok) {
      setSaving(false);
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }

    // Creation de l'admin de la boutique, rattache uniquement a celle-ci.
    if (!store && addAdmin) {
      const created = await r.json().catch(() => ({}));
      const newStoreId = created.id as string | undefined;
      const ur = await fetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: adminName.trim(),
          email: adminEmail.trim(),
          role: 'owner',
          password: adminPassword,
          pin: adminPin,
          pin_required: true,
          store_ids: newStoreId ? [newStoreId] : [],
        }),
      });
      if (!ur.ok) {
        setSaving(false);
        const j = await ur.json().catch(() => ({}));
        setError(
          `Boutique créée, mais l'admin n'a pas pu être créé : ${
            j.message ?? j.error ?? 'erreur'
          }. Ajoutez-le manuellement dans Utilisateurs.`,
        );
        return;
      }
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{store ? 'Modifier boutique' : 'Nouvelle boutique'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          <Field label="Nom de la boutique">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          {store && (
            <Field label="Code court (auto)">
              <input
                className="input font-mono text-sm bg-gray-50"
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ex : B1"
              />
              <p className="mt-1 text-xs text-ink-soft">
                Généré automatiquement à la création. Modifiable manuellement si besoin.
              </p>
            </Field>
          )}
          <Field label="Adresse">
            <input className="input" value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="N°, rue" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CP">
              <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} />
            </Field>
            <Field label="Ville" colSpan={2}>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
          </div>
          {store && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          )}

          {!store && (
            <div className="pt-3 mt-1 border-t border-border space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={addAdmin}
                  onChange={(e) => setAddAdmin(e.target.checked)}
                />
                Créer l&apos;administrateur de la boutique
              </label>
              {addAdmin && (
                <>
                  <p className="text-xs text-ink-soft">
                    Il gèrera cette boutique : mot de passe pour le back-office
                    (bo.) et PIN pour la caisse. Une fois la caisse connectée,
                    il pourra créer les autres utilisateurs de la boutique.
                  </p>
                  <Field label="Nom complet">
                    <input className="input" value={adminName}
                           onChange={(e) => setAdminName(e.target.value)} placeholder="ex : Sophie Martin" />
                  </Field>
                  <Field label="Email">
                    <input className="input" type="email" value={adminEmail}
                           onChange={(e) => setAdminEmail(e.target.value)} placeholder="sophie@boutique.fr" />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Mot de passe (8+ car.)">
                      <input className="input" type="password" value={adminPassword}
                             onChange={(e) => setAdminPassword(e.target.value)}
                             autoComplete="new-password" />
                    </Field>
                    <Field label="PIN caisse (4 chiffres)">
                      <input className="input font-mono" inputMode="numeric" maxLength={4}
                             value={adminPin}
                             onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                             placeholder="••••" />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegistersPanel({
  registers, stores, canWrite, onChange, planLabel, maxRegistersPerStore,
  canBuyExtraRegister, extraRegisterPrice,
}: {
  registers: Register[]; stores: Store[]; canWrite: boolean; onChange: () => void;
  planLabel: string; maxRegistersPerStore: number | null;
  canBuyExtraRegister: boolean; extraRegisterPrice: string;
}) {
  const [editing, setEditing] = useState<Register | null | undefined>(undefined);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [buyingAddon, setBuyingAddon] = useState(false);
  // Limite atteinte si CHAQUE boutique a déjà son quota de caisses.
  const atLimit = maxRegistersPerStore !== null && stores.length > 0 &&
    stores.every((s) => registers.filter((r) => r.store_id === s.id).length >= maxRegistersPerStore);

  // Souscrit une caisse supplémentaire (+prix/mois) puis ouvre la
  // création de caisse (la limite a augmenté).
  async function buyExtraAndAdd() {
    if (!confirm(`Souscrire une caisse supplémentaire (+${extraRegisterPrice} €/mois) ?\n\nFacturée au prorata sur votre abonnement Stripe.`)) return;
    setBuyingAddon(true);
    try {
      const r = await fetch('/api/billing/addon/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: 1 }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        alert(j.message ?? j.error ?? 'Impossible de souscrire l\'option.');
        return;
      }
      onChange(); // recharge (la limite serveur a augmenté)
      setEditing(null); // ouvre la création de caisse
    } finally {
      setBuyingAddon(false);
    }
  }

  async function release(r: Register) {
    const label = r.device_name ? `"${r.device_name}"` : 'ce poste';
    if (!confirm(
      `Liberer la caisse "${r.name}" de ${label} ?\n\n` +
      `Le poste actuellement lie ne pourra plus utiliser cette caisse, ` +
      `et vous devrez la re-selectionner sur un autre appareil au prochain acces.`,
    )) return;
    setReleasing(r.id);
    try {
      const res = await fetch(`/api/registers/${r.id}/release`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.message ?? j.error ?? 'Erreur');
        return;
      }
      onChange();
    } finally {
      setReleasing(null);
    }
  }

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="space-y-2">
          <button onClick={() => setEditing(null)} className="btn-primary"
                  disabled={stores.length === 0 || atLimit}
                  title={stores.length === 0 ? 'Créez d\'abord une boutique' : ''}>
            + Ajouter une caisse
          </button>
          {atLimit && (
            <div className="text-xs text-ink-soft space-y-2">
              <p>
                Votre offre <strong>{planLabel}</strong> est limitée à {maxRegistersPerStore} caisse(s) par boutique.
              </p>
              {canBuyExtraRegister ? (
                <button
                  onClick={() => void buyExtraAndAdd()}
                  disabled={buyingAddon}
                  className="btn-soft text-sm"
                >
                  {buyingAddon ? 'Souscription…' : `+ Ajouter une caisse (+${extraRegisterPrice} €/mois)`}
                </button>
              ) : (
                <p>
                  <a href="/settings/subscription" className="text-accent-deep underline">Passer à Croissance</a> pour des caisses illimitées.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Nom</th>
              <th className="text-left px-4 py-3 font-semibold">Boutique</th>
              <th className="text-left px-4 py-3 font-semibold">Poste lié</th>
              <th className="text-center px-4 py-3 font-semibold">État</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {registers.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-ink-soft">{r.store_name}</td>
                <td className="px-4 py-3">
                  {r.device_id ? (
                    <div className="text-xs">
                      <div className="font-medium">{r.device_name ?? 'Poste sans nom'}</div>
                      {r.bound_at && (
                        <div className="text-ink-soft">
                          depuis le {new Date(r.bound_at).toLocaleDateString('fr-FR')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-soft">Aucun</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Désactivée</Badge>}
                </td>
                <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                  {canWrite && r.device_id && (
                    <button
                      onClick={() => void release(r)}
                      disabled={releasing === r.id}
                      className="text-red-600 text-xs hover:underline disabled:opacity-50"
                    >
                      {releasing === r.id ? 'Libération…' : 'Libérer'}
                    </button>
                  )}
                  {canWrite && (
                    <button onClick={() => setEditing(r)} className="text-accent-deep text-xs hover:underline">
                      Modifier
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-soft">
        Une caisse est liée à un seul poste (tablette, iPad, PC). Pour la
        transférer sur un autre appareil, cliquez sur <strong>Libérer</strong> :
        la caisse redeviendra sélectionnable au prochain accès sur un nouveau poste.
      </p>

      {editing !== undefined && (
        <RegisterFormModal
          register={editing}
          stores={stores}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); onChange(); }}
        />
      )}
    </div>
  );
}

function RegisterFormModal({ register, stores, onClose, onSaved }: {
  register: Register | null; stores: Store[]; onClose: () => void; onSaved: () => void;
}) {
  const [storeId, setStoreId] = useState(register?.store_id ?? stores[0]?.id ?? '');
  const [code, setCode] = useState(register?.code ?? '');
  const [name, setName] = useState(register?.name ?? '');
  const [isActive, setIsActive] = useState(register?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!storeId) { setError('Boutique requise.'); return; }
    if (register && (!code.trim() || !name.trim())) {
      setError('Code et nom requis.');
      return;
    }
    setSaving(true); setError(null);
    const createBody: Record<string, unknown> = { store_id: storeId };
    // A la creation, on transmet uniquement ce que l'utilisateur a saisi.
    // Sinon le serveur genere le code (C1, C2…) et le nom (Caisse 1…).
    if (code.trim()) createBody.code = code.trim();
    if (name.trim()) createBody.name = name.trim();

    const r = register
      ? await fetch(`/api/registers/${register.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim(), name: name.trim(), is_active: isActive }),
        })
      : await fetch('/api/registers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{register ? 'Modifier caisse' : 'Nouvelle caisse'}</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          {!register && (
            <Field label="Boutique">
              <select className="input" value={storeId} onChange={(e) => setStoreId(e.target.value)} autoFocus>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label={register ? 'Nom' : 'Nom (auto si vide)'}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                   placeholder={register ? '' : 'ex : Caisse 1'} />
          </Field>
          {register && (
            <Field label="Code court">
              <input className="input font-mono text-sm bg-gray-50" value={code} maxLength={20}
                     onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ex : C1" />
            </Field>
          )}
          {register && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          )}
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaxPanel({ taxRates, canWrite, onChange }: {
  taxRates: TaxRate[]; canWrite: boolean; onChange: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-3">
      {canWrite && (
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          + Ajouter un taux
        </button>
      )}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Libellé</th>
              <th className="text-right px-4 py-3 font-semibold">Taux</th>
              <th className="text-center px-4 py-3 font-semibold">Défaut</th>
            </tr>
          </thead>
          <tbody>
            {taxRates.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono text-xs">{t.code}</td>
                <td className="px-4 py-3">{t.label}</td>
                <td className="px-4 py-3 text-right font-medium">{Number(t.rate).toFixed(1)}%</td>
                <td className="px-4 py-3 text-center">
                  {t.is_default ? <Badge tone="success">Oui</Badge> : <span className="text-ink-soft">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showCreate && (
        <TaxFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); onChange(); }}
        />
      )}
    </div>
  );
}

function TaxFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [rate, setRate] = useState<number>(20);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!code.trim() || !label.trim()) { setError('Code et libellé requis.'); return; }
    setSaving(true); setError(null);
    const r = await fetch('/api/tax-rates', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        label: label.trim(),
        rate,
        is_default: isDefault,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Nouveau taux de TVA</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>
        <div className="space-y-3">
          <Field label="Code">
            <input className="input" value={code} maxLength={20}
                   onChange={(e) => setCode(e.target.value)} placeholder="ex : TVA20" />
          </Field>
          <Field label="Libellé">
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value)}
                   placeholder="ex : Taux normal 20%" />
          </Field>
          <Field label="Taux (%)">
            <input type="number" step="0.1" min={0} max={100}
                   className="input" value={rate}
                   onChange={(e) => setRate(Number(e.target.value) || 0)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Définir comme taux par défaut
          </label>
        </div>
        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving} className="btn-primary">
            {saving ? 'Enregistrement…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, colSpan }: { label: string; children: React.ReactNode; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="text-xs font-medium text-ink-soft">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
