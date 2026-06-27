'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Data {
  organization: {
    id: string; name: string; legal_name: string;
    slug: string | null; siret: string | null; vat_number: string | null;
    address: { line1?: string; zip?: string; city?: string } | null;
    contact: { phone?: string; email?: string } | null;
    plan: string; trial_ends_at: string | null;
    created_at: string;
    max_devices?: number;
  };
  subscription: {
    plan: string; status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    external_ref: string | null;
  } | null;
  stats: {
    user_count: string; sale_count: string;
    total_ttc: string; last_sale_at: string | null;
  };
  events: Array<{
    id: string;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: string;
    performed_by_name: string | null;
    performed_by_email: string | null;
  }>;
}

export default function OrganizationDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const r = await fetch(`/api/admin/organizations/${id}`);
    if (r.ok) {
      const j = await r.json();
      setData(j);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [id]);

  if (loading) return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  if (!data) return <div className="p-8 text-sm text-danger">Erreur de chargement.</div>;

  const o = data.organization;
  const s = data.subscription;
  const due = s?.current_period_end ?? o.trial_ends_at;
  const daysLeft = due ? Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="p-8 space-y-5 max-w-5xl">
      <Link href="/admin/organizations" className="text-sm text-ink-soft hover:text-ink">
        ← Toutes les organisations
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{o.name}</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            {o.legal_name}{o.slug ? ` · slug : ${o.slug}` : ''}
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Plan" value={s?.plan ?? o.plan} />
        <Kpi
          label="Échéance"
          value={due
            ? `${new Date(due).toLocaleDateString('fr-FR')}${daysLeft !== null
                ? ` (${daysLeft >= 0 ? `${daysLeft}j` : 'expiré'})`
                : ''}`
            : '—'}
        />
        <Kpi label="Ventes validées" value={data.stats.sale_count} />
        <Kpi label="CA cumulé" value={`${Number(data.stats.total_ttc).toFixed(0)} €`} />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Identité</h3>
          <dl className="text-sm space-y-1.5">
            <Item label="Société" value={o.name} />
            <Item label="Raison sociale" value={o.legal_name} />
            <Item label="SIRET" value={o.siret ?? '—'} />
            <Item label="TVA intra." value={o.vat_number ?? '—'} />
            <Item label="Adresse" value={[o.address?.line1, o.address?.zip, o.address?.city].filter(Boolean).join(', ') || '—'} />
            <Item label="Téléphone" value={o.contact?.phone ?? '—'} />
            <Item label="Email" value={o.contact?.email ?? '—'} />
            <Item label="Inscrite le" value={new Date(o.created_at).toLocaleDateString('fr-FR')} />
          </dl>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Abonnement</h3>
          {s ? (
            <dl className="text-sm space-y-1.5">
              <Item label="Plan" value={s.plan} />
              <Item label="Statut" value={s.status} />
              <Item label="Période en cours" value={[s.current_period_start, s.current_period_end].map((d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—').join(' → ')} />
              <Item label="Résiliation à échéance" value={s.cancel_at_period_end ? 'Oui' : 'Non'} />
              <Item label="Référence externe" value={s.external_ref ?? '—'} />
            </dl>
          ) : (
            <div className="text-sm text-ink-soft">Pas encore d&apos;abonnement enregistré.</div>
          )}
        </div>
      </section>

      <AdminActions id={o.id} initialMaxDevices={o.max_devices ?? 1} onChange={() => void reload()} />

      <ActiveSessions id={o.id} />

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-soft mb-2">
          Historique des actions
        </h3>
        {data.events.length === 0 ? (
          <div className="card p-6 text-center text-ink-soft text-sm">Aucune action enregistrée.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-ink-soft text-[10px] uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Date</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                  <th className="text-left px-4 py-2 font-semibold">Détails</th>
                  <th className="text-left px-4 py-2 font-semibold">Par</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-4 py-2 text-ink-soft text-xs">{new Date(e.created_at).toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-2 font-medium">{e.event_type}</td>
                    <td className="px-4 py-2 text-ink-soft text-xs">
                      <code className="text-[11px]">{JSON.stringify(e.payload)}</code>
                    </td>
                    <td className="px-4 py-2 text-ink-soft text-xs">{e.performed_by_name ?? e.performed_by_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AdminActions({ id, initialMaxDevices, onChange }: {
  id: string; initialMaxDevices: number; onChange: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [extendReason, setExtendReason] = useState('');
  const [newPlan, setNewPlan] = useState<'starter'|'pro'>('pro');
  const [maxDevices, setMaxDevices] = useState<number>(initialMaxDevices);
  const [note, setNote] = useState('');

  async function call(action: Record<string, unknown>) {
    setBusy(JSON.stringify(action.action));
    setError(null);
    const r = await fetch(`/api/admin/organizations/${id}/subscription`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
    });
    setBusy(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    onChange();
  }

  return (
    <section className="card p-5 space-y-4">
      <h3 className="font-semibold">Actions admin</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border p-3">
          <div className="font-medium text-sm">Prolonger l&apos;essai / offrir des jours</div>
          <div className="flex items-center gap-2 mt-2">
            <input type="number" min={1} max={365} className="input h-9 max-w-[100px]"
                   value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value) || 1)} />
            <span className="text-sm text-ink-soft">jours</span>
          </div>
          <input className="input mt-2 h-9 text-sm" value={extendReason}
                 onChange={(e) => setExtendReason(e.target.value)}
                 placeholder="Motif (optionnel)" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => void call({ action: 'extend_trial', days: extendDays, reason: extendReason || undefined })}
                    disabled={busy !== null} className="btn-soft text-xs flex-1">
              + Prolonger essai
            </button>
            <button onClick={() => void call({ action: 'grant_comp', days: extendDays, reason: extendReason || 'Période offerte' })}
                    disabled={busy !== null || !extendReason} className="btn-soft text-xs flex-1">
              🎁 Offrir
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="font-medium text-sm">Changer de plan</div>
          <select className="input mt-2 h-9" value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value as typeof newPlan)}>
            <option value="starter">Starter (29 €/mois)</option>
            <option value="pro">Pro (59 €/mois)</option>
          </select>
          <button onClick={() => void call({ action: 'change_plan', plan: newPlan })}
                  disabled={busy !== null} className="btn-soft text-xs w-full mt-2">
            Appliquer le plan
          </button>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="font-medium text-sm">Limite multi-appareils</div>
          <p className="text-xs text-ink-soft mt-1">
            Nombre de sessions simultanées autorisées. 1 = mono-poste, &gt;1 = option payante.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input type="number" min={1} max={50}
                   className="input h-9 max-w-[100px]"
                   value={maxDevices}
                   onChange={(e) => setMaxDevices(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
            <button onClick={() => void call({ action: 'set_max_devices', max_devices: maxDevices })}
                    disabled={busy !== null} className="btn-soft text-xs flex-1">
              Appliquer
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="font-medium text-sm">Résiliation</div>
          <p className="text-xs text-ink-soft mt-1">
            "À l&apos;échéance" : termine la période en cours puis stoppe. "Immédiate" : coupe l&apos;accès tout de suite.
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => void call({ action: 'cancel', immediate: false })}
                    disabled={busy !== null} className="btn-soft text-xs flex-1">
              À l&apos;échéance
            </button>
            <button onClick={() => void call({ action: 'cancel', immediate: true })}
                    disabled={busy !== null} className="btn-soft text-xs flex-1 text-danger">
              Immédiate
            </button>
            <button onClick={() => void call({ action: 'reactivate' })}
                    disabled={busy !== null} className="btn-soft text-xs flex-1 text-success">
              Réactiver
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="font-medium text-sm">Note interne</div>
          <textarea className="input mt-2 h-20 text-sm" value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note visible uniquement par l'équipe Webpos" />
          <button onClick={() => { if (note.trim()) { void call({ action: 'note', text: note.trim() }); setNote(''); } }}
                  disabled={busy !== null || !note.trim()} className="btn-soft text-xs w-full mt-2">
            Enregistrer la note
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
    </section>
  );
}

function ActiveSessions({ id }: { id: string }) {
  interface SessionRow {
    id: string;
    user_id: string;
    user_email: string;
    user_full_name: string;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    expires_at: string;
  }
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [maxDevices, setMaxDevices] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const r = await fetch(`/api/admin/organizations/${id}/sessions`);
    if (r.ok) {
      const j = await r.json();
      setSessions(j.sessions ?? []);
      setMaxDevices(Number(j.max_devices) || 1);
    }
    setLoading(false);
  }
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [id]);

  async function revoke(sid: string) {
    if (!confirm('Libérer cette place ? L\'utilisateur sera déconnecté.')) return;
    setBusy(sid);
    const r = await fetch(`/api/admin/organizations/${id}/sessions/${sid}`, { method: 'DELETE' });
    setBusy(null);
    if (r.ok) void reload();
  }

  function deviceLabel(ua: string | null): string {
    if (!ua) return 'Appareil inconnu';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Navigateur';
  }
  function browserLabel(ua: string | null): string {
    if (!ua) return '';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Safari\//i.test(ua)) return 'Safari';
    return '';
  }

  return (
    <section className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Appareils connectés</h3>
          <p className="text-xs text-ink-soft mt-0.5">
            Sessions actives en ce moment.
            {' '}<strong>{sessions.length}</strong> / {maxDevices} place(s) utilisée(s).
          </p>
        </div>
        <button onClick={() => void reload()} className="btn-ghost text-xs">
          Rafraîchir
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft py-2">Chargement…</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-sm text-ink-soft text-center">
          Aucun appareil connecté.
        </div>
      ) : (
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {s.user_full_name} <span className="text-ink-soft font-normal">· {s.user_email}</span>
                </div>
                <div className="text-xs text-ink-soft mt-0.5">
                  {deviceLabel(s.user_agent)}
                  {browserLabel(s.user_agent) && ` · ${browserLabel(s.user_agent)}`}
                  {s.ip && ` · IP ${s.ip}`}
                  {' · ouverte le '}{new Date(s.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
              <button
                onClick={() => void revoke(s.id)}
                disabled={busy === s.id}
                className="btn-ghost text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                title="Forcer la déconnexion / libérer la place"
              >
                {busy === s.id ? '…' : 'Libérer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight capitalize">{value}</div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1 last:border-0">
      <dt className="text-ink-soft text-xs">{label}</dt>
      <dd className="font-medium text-right truncate">{value}</dd>
    </div>
  );
}
