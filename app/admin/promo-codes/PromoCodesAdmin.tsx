'use client';

import { useEffect, useState } from 'react';

interface PromoRow {
  id: string;
  code: string;
  active: boolean;
  times_redeemed: number;
  max_redemptions: number | null;
  coupon: { percent_off: number | null; amount_off: number | null; duration: string; name: string | null };
}

const DURATION_LABELS: Record<string, string> = {
  once: '1 mois', repeating: 'plusieurs mois', forever: 'à vie',
};

export default function PromoCodesAdmin() {
  const [codes, setCodes] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulaire de création
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('100');
  const [duration, setDuration] = useState<'once' | 'repeating' | 'forever'>('forever');
  const [months, setMonths] = useState('3');
  const [maxRedemptions, setMaxRedemptions] = useState('');

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/admin/promo-codes');
    if (r.ok) {
      const j = await r.json();
      setCodes(j.codes ?? []);
      setNotConfigured(!!j.not_configured);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  async function create() {
    setBusy(true); setError(null);
    const body: Record<string, unknown> = {
      code: code.trim(),
      kind,
      value: Number(value),
      duration,
    };
    if (duration === 'repeating') body.duration_in_months = Number(months);
    if (maxRedemptions.trim()) body.max_redemptions = Number(maxRedemptions);
    const r = await fetch('/api/admin/promo-codes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    setCode('');
    void reload();
  }

  async function toggle(id: string, active: boolean) {
    await fetch('/api/admin/promo-codes', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active }),
    });
    void reload();
  }

  if (notConfigured) {
    return (
      <div className="card p-6 text-sm text-ink-soft">
        Configurez d&apos;abord Stripe dans{' '}
        <a href="/admin/configuration" className="text-accent-deep underline">Configuration</a>{' '}
        (clé secrète) pour créer des codes.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Création */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Nouveau code</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-soft">Code (saisi par le client)</label>
            <input className="input mt-1 font-mono uppercase" value={code}
                   onChange={(e) => setCode(e.target.value.toUpperCase())}
                   placeholder="BIENVENUE2026" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Type de remise</label>
            <select className="input mt-1" value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'amount')}>
              <option value="percent">Pourcentage (%)</option>
              <option value="amount">Montant fixe (€)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">
              Valeur {kind === 'percent' ? '(% — 100 = gratuit)' : '(€)'}
            </label>
            <input type="number" min={1} className="input mt-1" value={value}
                   onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-soft">Durée de la remise</label>
            <select className="input mt-1" value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)}>
              <option value="once">1 mois</option>
              <option value="repeating">Plusieurs mois</option>
              <option value="forever">À vie</option>
            </select>
          </div>
          {duration === 'repeating' && (
            <div>
              <label className="text-xs font-medium text-ink-soft">Nombre de mois</label>
              <input type="number" min={1} max={36} className="input mt-1" value={months}
                     onChange={(e) => setMonths(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-ink-soft">Utilisations max (optionnel)</label>
            <input type="number" min={1} className="input mt-1" value={maxRedemptions}
                   onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="illimité" />
          </div>
        </div>
        {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <button onClick={() => void create()} disabled={busy || !code.trim()} className="btn-primary">
          {busy ? 'Création…' : 'Créer le code'}
        </button>
      </div>

      {/* Liste */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Remise</th>
              <th className="text-left px-4 py-3 font-semibold">Durée</th>
              <th className="text-center px-4 py-3 font-semibold">Utilisé</th>
              <th className="text-center px-4 py-3 font-semibold">État</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">Chargement…</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-soft">Aucun code créé.</td></tr>
            ) : codes.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                <td className="px-4 py-3">
                  {c.coupon.percent_off != null
                    ? `${c.coupon.percent_off}%`
                    : c.coupon.amount_off != null
                      ? `${(c.coupon.amount_off / 100).toFixed(2)} €`
                      : '—'}
                </td>
                <td className="px-4 py-3 text-ink-soft">{DURATION_LABELS[c.coupon.duration] ?? c.coupon.duration}</td>
                <td className="px-4 py-3 text-center">
                  {c.times_redeemed}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.active
                    ? <span className="text-success text-xs font-medium">Actif</span>
                    : <span className="text-ink-soft text-xs">Désactivé</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => void toggle(c.id, !c.active)}
                    className={`text-xs hover:underline ${c.active ? 'text-danger' : 'text-accent-deep'}`}
                  >
                    {c.active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
