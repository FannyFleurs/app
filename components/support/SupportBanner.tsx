'use client';

import { useEffect, useState } from 'react';

/**
 * Bandeau affiché en haut quand la session courante est un DÉPANNAGE
 * (impersonation d'une boutique par l'assistance). Rappelle l'organisation en
 * cours et permet de quitter — ce qui révoque la session et renvoie à l'admin.
 */
export default function SupportBanner() {
  const [state, setState] = useState<{ org_name: string; access_expires_at: string | null } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let stop = false;
    async function check() {
      try {
        const r = await fetch('/api/support-access/current', { cache: 'no-store' });
        const j = await r.json();
        if (!stop) setState(j.impersonating ? { org_name: j.org_name, access_expires_at: j.access_expires_at } : null);
      } catch { /* ignore */ }
    }
    void check();
    const t = setInterval(check, 30_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  if (!state) return null;

  const until = state.access_expires_at
    ? new Date(state.access_expires_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  async function leave() {
    setLeaving(true);
    try {
      const r = await fetch('/api/support-access/exit', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      window.location.assign(j.redirect || '/');
    } catch {
      setLeaving(false);
    }
  }

  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white"
      style={{ background: '#8a1538' }}
    >
      <span>
        Mode dépannage : <strong>{state.org_name}</strong>
        {until ? ` · accès jusqu’à ${until}` : ''}
      </span>
      <button
        onClick={() => void leave()}
        disabled={leaving}
        className="rounded-md bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25 disabled:opacity-60"
      >
        {leaving ? '…' : 'Quitter le dépannage'}
      </button>
    </div>
  );
}
