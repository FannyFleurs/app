'use client';

import { useCallback, useEffect, useState } from 'react';

/** IPv4 stricte (octets 0-255) ou nom d'hôte (ex : imprimante.local). */
function isValidHost(h: string): boolean {
  if (!h) return false;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return m.slice(1).every((o) => Number(o) >= 0 && Number(o) <= 255);
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/.test(h);
}

/**
 * Réglage de l'imprimante ticket réseau (IP). La saisie se fait ici, mais
 * l'impression n'est possible que depuis l'application native iOS/Android :
 * un navigateur web ne peut pas ouvrir de socket TCP vers l'imprimante.
 */
export default function IpPrinterSection({ stores, canWrite }: {
  stores: { id: string; name: string }[]; canWrite: boolean;
}) {
  // Par défaut on cible une boutique (pas le niveau organisation) : chaque
  // boutique a sa propre imprimante avec une IP différente.
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '');
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(9100);
  const [width, setWidth] = useState<384 | 576>(576);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setMsg(null); setErr(null);
    const r = await fetch(`/api/settings/ip-printer${storeId ? `?store_id=${storeId}` : ''}`);
    if (r.ok) {
      const s = (await r.json()).settings;
      setEnabled(!!s.enabled);
      setHost(s.host ?? '');
      setPort(s.port ?? 9100);
      setWidth(s.width_dots === 384 ? 384 : 576);
    }
    setLoading(false);
  }, [storeId]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setErr(null); setMsg(null);
    if (enabled && !isValidHost(host.trim())) {
      setErr('Adresse IP invalide (ex : 192.168.1.50).');
      return;
    }
    setSaving(true);
    const r = await fetch('/api/settings/ip-printer', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId || undefined,
        enabled, host: host.trim(), port, width_dots: width,
      }),
    });
    setSaving(false);
    if (r.ok) setMsg('Réglages imprimante IP enregistrés.');
    else setErr('Échec de l’enregistrement.');
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-semibold">Imprimante ticket réseau (IP)</h3>
        <p className="text-sm text-ink-soft mt-1">
          Alternative aux imprimantes Star : une imprimante ESC/POS en réseau
          (port RAW 9100), pilotée directement par l’adresse IP.
        </p>
      </div>

      <div className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
        <strong>Fonctionne uniquement dans l’application HelloPos iOS / Android.</strong>{' '}
        Sur navigateur web, la caisse ne peut pas piloter d’imprimante IP : le
        réglage se saisit ici mais l’impression a lieu depuis l’app installée.
      </div>

      {stores.length > 1 && (
        <p className="text-sm text-ink-soft">
          Configuration <strong>par boutique</strong> : chaque boutique a sa propre
          imprimante avec une IP différente. Sélectionne la boutique puis saisis
          son adresse. « Toutes les boutiques » ne sert que de valeur par défaut
          partagée, pour les boutiques sans réglage propre.
        </p>
      )}

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-soft">Boutique</span>
          <select className="input h-10 w-full mt-1" value={storeId}
                  onChange={(e) => setStoreId(e.target.value)} disabled={!canWrite}>
            <option value="">Toutes les boutiques</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Adresse IP de l’imprimante</span>
          <input className="input h-10 w-full mt-1" placeholder="ex : 192.168.1.50"
                 value={host} onChange={(e) => setHost(e.target.value)}
                 disabled={!canWrite || loading}
                 autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Port</span>
          <input className="input h-10 w-full mt-1" type="number" value={port}
                 onChange={(e) => setPort(Number(e.target.value) || 9100)}
                 disabled={!canWrite || loading} />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Largeur papier</span>
          <select className="input h-10 w-full mt-1" value={width}
                  onChange={(e) => setWidth(Number(e.target.value) as 384 | 576)}
                  disabled={!canWrite || loading}>
            <option value={576}>80 mm (576 points)</option>
            <option value={384}>58 mm (384 points)</option>
          </select>
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled}
               onChange={(e) => setEnabled(e.target.checked)}
               disabled={!canWrite || loading} />
        Activer l’impression IP pour cette boutique
      </label>

      {canWrite && (
        <div>
          <button className="btn-primary h-10 px-4" disabled={saving || loading} onClick={() => void save()}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
      )}
    </div>
  );
}
