'use client';

import { useEffect, useMemo, useState } from 'react';
import { OrgTable } from '../AdminDashboard';

interface OrgRow {
  id: string; slug: string | null;
  name: string; legal_name: string;
  plan: string; trial_ends_at: string | null;
  created_at: string;
  sub_status: string | null; sub_plan: string | null; sub_period_end: string | null;
  admin_email: string | null;
  user_count: string; sale_count: string;
  last_sale_at: string | null;
}

export default function OrganizationsList() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'trial' | 'active' | 'cancelled' | 'expiring'>('all');

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/admin/organizations');
      if (r.ok) setOrgs((await r.json()).organizations ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs.filter((o) => {
      if (filter === 'trial' && o.plan !== 'trial') return false;
      if (filter === 'active' && (o.sub_status !== 'active' || o.plan === 'trial')) return false;
      if (filter === 'cancelled' && o.sub_status !== 'cancelled') return false;
      if (filter === 'expiring') {
        const due = o.sub_period_end ?? o.trial_ends_at;
        if (!due) return false;
        const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
        if (days > 7 || days < 0) return false;
      }
      if (!needle) return true;
      return (
        o.name.toLowerCase().includes(needle) ||
        o.legal_name.toLowerCase().includes(needle) ||
        o.admin_email?.toLowerCase().includes(needle) ||
        o.slug?.toLowerCase().includes(needle)
      );
    });
  }, [orgs, q, filter]);

  return (
    <div className="p-8 space-y-4 max-w-7xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organisations</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Toutes les sociétés clientes inscrites sur Webpos.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <input
            className="input pr-9"
            placeholder="Rechercher (nom, email, slug…)"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['all','trial','active','expiring','cancelled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
                filter === f ? 'accent-bar text-white border-transparent' : 'bg-white text-ink border-border hover:border-gray-300'
              }`}
            >
              {f === 'all' ? 'Tous'
                : f === 'trial' ? 'En essai'
                : f === 'active' ? 'Abonnés actifs'
                : f === 'expiring' ? 'Expire bientôt'
                : 'Résiliés'}
            </button>
          ))}
        </div>
      </div>

      {loading
        ? <div className="card p-10 text-center text-ink-soft text-sm">Chargement…</div>
        : <OrgTable orgs={filtered} />}
    </div>
  );
}
