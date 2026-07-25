'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { confirmThemed, alertThemed } from '@/lib/ui/dialog';

interface Rate {
  id: string;
  code: string;
  label: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

export default function TvaSettingsForm({ stores, canWrite }: {
  stores: { id: string; name: string }[];
  canWrite: boolean;
}) {
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // TVA par défaut par boutique
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [storeDefault, setStoreDefault] = useState<string | null>(null);
  const [inherited, setInherited] = useState(false);
  const [savingDefault, setSavingDefault] = useState(false);

  const loadRates = useCallback(async () => {
    const r = await fetch('/api/tax-rates');
    if (r.ok) setRates((await r.json()).tax_rates as Rate[]);
    setLoading(false);
  }, []);
  useEffect(() => { void loadRates(); }, [loadRates]);

  const loadStoreDefault = useCallback(async (sid: string) => {
    if (!sid) return;
    const r = await fetch(`/api/settings/tax?store_id=${encodeURIComponent(sid)}`);
    if (r.ok) {
      const j = await r.json();
      setStoreDefault(j.settings?.default_code ?? null);
      setInherited(!!j.inherited);
    }
  }, []);
  useEffect(() => { void loadStoreDefault(storeId); }, [storeId, loadStoreDefault]);

  async function saveStoreDefault(code: string | null) {
    setSavingDefault(true); setErr(null); setMsg(null);
    const r = await fetch('/api/settings/tax', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, default_code: code }),
    });
    setSavingDefault(false);
    if (r.ok) {
      setStoreDefault(code); setInherited(false);
      setMsg('Taux par défaut de la boutique enregistré.');
    } else {
      setErr('Enregistrement impossible.');
    }
  }

  // --- Gestion des taux (organisation) ---
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);

  async function deactivate(rate: Rate) {
    if (rate.is_default) { await alertThemed({ message: 'Impossible de désactiver le taux par défaut. Choisis-en un autre d\'abord.' }); return; }
    if (!(await confirmThemed({ message: `Désactiver le taux « ${rate.label} » (${rate.rate} %) ? Les ventes passées ne changent pas.` }))) return;
    const r = await fetch(`/api/tax-rates/${rate.id}`, { method: 'DELETE' });
    if (r.ok) { await loadRates(); } else { setErr('Désactivation impossible.'); }
  }

  async function setAsDefault(rate: Rate) {
    const r = await fetch(`/api/tax-rates/${rate.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    });
    if (r.ok) { await loadRates(); setMsg(`« ${rate.label} » est le taux par défaut de l'organisation.`); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl">
      <PageHeader
        title="TVA"
        subtitle="Les taux sont communs à l'organisation ; chaque boutique choisit son taux par défaut."
        actions={null}
      />

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      {/* --- TVA par défaut par boutique --- */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold">Taux par défaut par boutique</h3>
        <p className="text-sm text-ink-soft">
          Le taux appliqué automatiquement aux nouveaux articles et aux prix libres de cette boutique.
        </p>
        <label className="block text-sm">
          <span className="text-ink-soft">Boutique</span>
          <select className="input h-10 w-full sm:w-72 mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        {inherited && (
          <div className="text-xs text-ink-soft">
            Cette boutique utilise le taux par défaut de l'organisation. Choisis un taux pour lui en attribuer un propre.
          </div>
        )}

        <div className="space-y-1.5">
          {rates.filter((r) => r.is_active).map((r) => {
            const active = storeDefault === r.code || (inherited && r.is_default);
            return (
              <label key={r.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer ${active ? 'border-primary bg-primary-soft/40' : 'border-border'}`}>
                <input
                  type="radio"
                  name="storeDefault"
                  checked={storeDefault === r.code}
                  disabled={!canWrite || savingDefault}
                  onChange={() => void saveStoreDefault(r.code)}
                />
                <span className="font-medium">{r.label}</span>
                <span className="text-ink-soft text-sm ml-auto">{r.rate} %</span>
                {inherited && r.is_default && <span className="text-[10px] text-ink-soft">(hérité)</span>}
              </label>
            );
          })}
        </div>
      </div>

      {/* --- Taux de TVA (organisation) --- */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Taux de TVA (organisation)</h3>
          {canWrite && <button className="btn-soft text-sm h-9" onClick={() => setShowAdd(true)}>+ Ajouter un taux</button>}
        </div>
        {loading ? (
          <p className="text-sm text-ink-soft">Chargement…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft text-xs uppercase tracking-wide">
                  <th className="py-1.5">Code</th><th>Libellé</th><th>Taux</th><th>Défaut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 font-mono text-xs">{r.code}</td>
                    <td>{r.label}</td>
                    <td>{r.rate} %</td>
                    <td>{r.is_default ? <span className="chip">défaut org.</span> : (canWrite && <button className="btn-ghost text-xs" onClick={() => void setAsDefault(r)}>définir</button>)}</td>
                    <td className="text-right whitespace-nowrap">
                      {canWrite && <>
                        <button className="btn-ghost text-xs" onClick={() => setEditing(r)}>Modifier</button>
                        <button className="btn-ghost text-xs text-danger" onClick={() => void deactivate(r)}>Désactiver</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(showAdd || editing) && (
        <RateModal
          rate={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={async () => { setShowAdd(false); setEditing(null); await loadRates(); }}
          onError={(m) => setErr(m)}
        />
      )}
    </div>
  );
}

function RateModal({ rate, onClose, onSaved, onError }: {
  rate: Rate | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [code, setCode] = useState(rate?.code ?? '');
  const [label, setLabel] = useState(rate?.label ?? '');
  const [value, setValue] = useState(String(rate?.rate ?? ''));
  const [isDefault, setIsDefault] = useState(rate?.is_default ?? false);
  const [saving, setSaving] = useState(false);
  const isEdit = !!rate;

  async function save() {
    setSaving(true);
    const num = Number(value.replace(',', '.'));
    if (!Number.isFinite(num)) { setSaving(false); onError('Taux invalide.'); return; }
    let r: Response;
    if (isEdit) {
      r = await fetch(`/api/tax-rates/${rate!.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, rate: num, is_default: isDefault }),
      });
    } else {
      r = await fetch('/api/tax-rates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), label: label.trim(), rate: num, is_default: isDefault }),
      });
    }
    setSaving(false);
    if (r.ok) { onSaved(); }
    else {
      const j = await r.json().catch(() => null);
      onError(j?.error === 'CODE_ALREADY_EXISTS' ? 'Ce code existe déjà.' : 'Enregistrement impossible.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{isEdit ? 'Modifier le taux' : 'Ajouter un taux'}</h3>
        <label className="block text-sm">
          <span className="text-ink-soft">Code {isEdit && '(non modifiable)'}</span>
          <input className="input mt-1" value={code} disabled={isEdit} onChange={(e) => setCode(e.target.value)} placeholder="TVA20" />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Libellé</span>
          <input className="input mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="TVA 20 %" />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Taux (%)</span>
          <input className="input mt-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="20" inputMode="decimal" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Taux par défaut de l'organisation
        </label>
        <button className="btn-primary w-full h-11 mt-1" disabled={saving} onClick={() => void save()}>
          {saving ? '…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
