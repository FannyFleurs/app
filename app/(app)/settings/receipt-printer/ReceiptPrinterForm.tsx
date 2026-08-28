'use client';
import { confirmThemed } from '@/lib/ui/dialog';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import IpPrinterSection from './IpPrinterSection';

interface Printer {
  id: string;
  mac: string;
  label: string;
  store_id: string | null;
  store_name: string | null;
  role: string;
  poll_token: string | null;
  poll_interval: number;
  paper_width: number;
  enabled: boolean;
  last_seen_at: string | null;
  last_status: string | null;
  queued: number;
}

export default function ReceiptPrinterForm({ stores, canWrite, lockStoreId = null }: {
  stores: { id: string; name: string }[]; canWrite: boolean;
  /** Boutique du poste de caisse : verrouille la config imprimante dessus. */
  lockStoreId?: string | null;
}) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Formulaire d'ajout
  const [mac, setMac] = useState('');
  const [label, setLabel] = useState('Ticket / tiroir');
  const [storeId, setStoreId] = useState('');
  const [token, setToken] = useState('');
  const [paperWidth, setPaperWidth] = useState<58 | 80>(80);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = useCallback(async () => {
    const r = await fetch('/api/cloudprnt/printers?role=receipt');
    if (r.ok) setPrinters((await r.json()).printers as Printer[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function add() {
    if (!mac.trim() || !label.trim()) { setErr('Renseigne le MAC et un nom.'); return; }
    setSaving(true); setErr(null); setMsg(null);
    const r = await fetch('/api/cloudprnt/printers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mac: mac.trim(), label: label.trim(), store_id: storeId || null, poll_token: token.trim() || null, role: 'receipt', paper_width: paperWidth }),
    });
    setSaving(false);
    if (r.ok) {
      setMac(''); setToken(''); setMsg('Imprimante enregistrée.');
      await load();
    } else {
      const j = await r.json().catch(() => null);
      setErr(j?.error === 'MAC_ALREADY_REGISTERED' ? 'Ce MAC est déjà enregistré.' : (j?.error ?? 'Échec.'));
    }
  }

  async function toggle(p: Printer) {
    await fetch(`/api/cloudprnt/printers/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !p.enabled }),
    });
    await load();
  }

  async function setWidth(p: Printer, width: 58 | 80) {
    await fetch(`/api/cloudprnt/printers/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paper_width: width }),
    });
    await load();
  }

  async function remove(p: Printer) {
    if (!(await confirmThemed({ message: `Supprimer l'imprimante « ${p.label} » ?` }))) return;
    await fetch(`/api/cloudprnt/printers/${p.id}`, { method: 'DELETE' });
    await load();
  }

  async function testPrint(p: Printer) {
    setMsg(null); setErr(null);
    const r = await fetch('/api/cloudprnt/print-receipt-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_id: p.id }),
    });
    if (r.ok) setMsg(`Ticket de test + ouverture tiroir envoyés à « ${p.label} ». Ça sortira au prochain sondage de l'imprimante.`);
    else {
      const j = await r.json().catch(() => null);
      setErr(j?.error === 'NO_PRINTER' ? 'Aucune imprimante active trouvée.' : (j?.error ?? 'Échec du test.'));
    }
  }

  const pollUrl = (p: Printer) => `${origin}/api/cloudprnt${p.poll_token ? `?t=${encodeURIComponent(p.poll_token)}` : ''}`;

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-3xl">
      <PageHeader
        title="Imprimante ticket (CloudPRNT)"
        subtitle="Impression des tickets sur une imprimante Star (TSP143 / mC-Print) en Ethernet, avec ouverture du tiroir-caisse branché dessus."
        actions={null}
      />

      <div className="card p-4 text-sm text-ink-soft space-y-1">
        <p className="font-medium text-ink">Comment ça marche</p>
        <p>1. Enregistre ci-dessous l'imprimante (son adresse MAC, au dos de l'appareil).</p>
        <p>2. Sur l'imprimante (page de config Star CloudPRNT), colle l'<strong>URL de sondage</strong> affichée, active CloudPRNT et règle l'intervalle (2–5 s conseillé).</p>
        <p>3. Le tiroir-caisse se branche sur le port RJ11/DK de l'imprimante : il s'ouvre alors depuis le bouton discret de la caisse et à chaque ticket encaissé en espèces.</p>
      </div>

      {msg && <div className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{msg}</div>}
      {err && <div className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</div>}

      {loading ? (
        <p className="text-sm text-ink-soft">Chargement…</p>
      ) : printers.length === 0 ? (
        <p className="text-sm text-ink-soft">Aucune imprimante ticket enregistrée.</p>
      ) : (
        <div className="space-y-3">
          {printers.map((p) => (
            <div key={p.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{p.label}
                    {!p.enabled && <span className="ml-2 text-xs text-ink-soft">(désactivée)</span>}
                  </div>
                  <div className="text-xs text-ink-soft font-mono">{p.mac}</div>
                  <div className="text-xs text-ink-soft mt-0.5">
                    {p.store_name ? `Boutique : ${p.store_name}` : 'Toutes boutiques'}
                    {' · '}{p.queued > 0 ? `${p.queued} en file` : 'file vide'}
                    {p.last_seen_at
                      ? ` · vue ${new Date(p.last_seen_at).toLocaleString('fr-FR')}`
                      : ' · jamais vue'}
                  </div>
                  <div className="text-xs mt-0.5">
                    {(() => {
                      const secs = p.last_seen_at
                        ? Math.round((Date.now() - new Date(p.last_seen_at).getTime()) / 1000)
                        : null;
                      if (secs == null) {
                        return <span className="text-danger">● Jamais vue — l'imprimante ne sonde pas encore (URL/CloudPRNT à vérifier).</span>;
                      }
                      if (secs <= 15) {
                        return <span className="text-success">● En ligne — sonde active ({secs}s)</span>;
                      }
                      return <span className="text-warning">● Silencieuse depuis {secs}s — l'imprimante a cessé de sonder (redémarre-la / vérifie CloudPRNT activé).</span>;
                    })()}
                    {p.last_status ? <span className="text-ink-soft"> · état : {p.last_status}</span> : null}
                  </div>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap justify-end items-center gap-2">
                    <label className="text-xs text-ink-soft inline-flex items-center gap-1">
                      Papier
                      <select
                        className="input h-8 text-xs py-0"
                        value={p.paper_width}
                        onChange={(e) => void setWidth(p, Number(e.target.value) as 58 | 80)}
                      >
                        <option value={80}>80 mm</option>
                        <option value={58}>58 mm</option>
                      </select>
                    </label>
                    <button className="btn-soft text-xs" onClick={() => void testPrint(p)}>Test ticket + tiroir</button>
                    <button className="btn-soft text-xs" onClick={() => void toggle(p)}>
                      {p.enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button className="btn-soft text-xs text-danger" onClick={() => void remove(p)}>Supprimer</button>
                  </div>
                )}
              </div>
              <label className="block text-xs">
                <span className="text-ink-soft">URL de sondage à saisir sur l'imprimante</span>
                <input readOnly onFocus={(e) => e.currentTarget.select()}
                       className="input h-9 w-full mt-1 font-mono text-xs" value={pollUrl(p)} />
              </label>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold">Ajouter une imprimante ticket</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-ink-soft">Adresse MAC</span>
              <input className="input h-10 w-full mt-1" placeholder="00:11:62:xx:xx:xx" value={mac} onChange={(e) => setMac(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Nom</span>
              <input className="input h-10 w-full mt-1" value={label} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Boutique</span>
              <select className="input h-10 w-full mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Toutes les boutiques</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Jeton (optionnel, sécurise l'URL)</span>
              <input className="input h-10 w-full mt-1" value={token} onChange={(e) => setToken(e.target.value)} placeholder="laisser vide si non utilisé" />
            </label>
            <label className="block text-sm">
              <span className="text-ink-soft">Largeur papier</span>
              <select className="input h-10 w-full mt-1" value={paperWidth}
                      onChange={(e) => setPaperWidth(Number(e.target.value) as 58 | 80)}>
                <option value={80}>80 mm (standard)</option>
                <option value={58}>58 mm</option>
              </select>
            </label>
          </div>
          <button className="btn-primary h-10 px-4" disabled={saving} onClick={() => void add()}>
            {saving ? '…' : 'Enregistrer l’imprimante'}
          </button>
        </div>
      )}

      <IpPrinterSection stores={stores} canWrite={canWrite} lockStoreId={lockStoreId} />
    </div>
  );
}
