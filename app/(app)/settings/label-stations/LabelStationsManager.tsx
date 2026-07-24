'use client';
import { confirmThemed, promptThemed } from '@/lib/ui/dialog';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';

interface Station {
  id: string; store_id: string; store_name: string; device_id: string;
  name: string; last_seen_at: string | null; created_at: string;
}

export default function LabelStationsManager({ canWrite, stores }: {
  canWrite: boolean;
  stores: { id: string; name: string }[];
}) {
  const [stations, setStations] = useState<Station[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Codes d'appairage par boutique : { code, qr } affichés à la demande.
  const [pairing, setPairing] = useState<Record<string, { code: string; qr: string | null } | 'loading'>>({});

  async function reload() {
    const r = await fetch('/api/label-stations');
    setStations(r.ok ? ((await r.json()).stations as Station[]) : []);
  }
  useEffect(() => { void reload(); }, []);

  async function showPairing(storeId: string) {
    setPairing((c) => ({ ...c, [storeId]: 'loading' }));
    const r = await fetch(`/api/label-stations/pairing?store_id=${encodeURIComponent(storeId)}`);
    const j = r.ok ? await r.json() : null;
    setPairing((c) => ({ ...c, [storeId]: j?.code ? { code: j.code, qr: j.qr } : { code: '', qr: null } }));
  }
  async function generatePairing(storeId: string) {
    setPairing((c) => ({ ...c, [storeId]: 'loading' }));
    const r = await fetch('/api/label-stations/pairing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    });
    const j = r.ok ? await r.json() : null;
    setPairing((c) => ({ ...c, [storeId]: j?.code ? { code: j.code, qr: j.qr } : { code: '', qr: null } }));
  }

  // Groupe les PDA par boutique (toutes les boutiques affichées, même vides).
  const byStore = useMemo(() => {
    const map = new Map<string, Station[]>();
    for (const s of stores) map.set(s.id, []);
    for (const st of stations ?? []) {
      if (!map.has(st.store_id)) map.set(st.store_id, []);
      map.get(st.store_id)!.push(st);
    }
    return map;
  }, [stations, stores]);

  async function rename(st: Station) {
    const name = await promptThemed({ title: 'Renommer le PDA', message: 'Nom du PDA', defaultValue: st.name });
    if (name == null || !name.trim()) return;
    setBusy(true);
    await fetch(`/api/label-stations/${st.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    await reload();
  }

  async function reassign(st: Station, storeId: string) {
    if (!storeId || storeId === st.store_id) return;
    setBusy(true);
    await fetch(`/api/label-stations/${st.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId }),
    });
    setBusy(false);
    await reload();
  }

  async function remove(st: Station) {
    if (!(await confirmThemed({ message: `Dissocier le PDA « ${st.name} » ? Il redemandera sa boutique à la prochaine ouverture.` }))) return;
    setBusy(true);
    await fetch(`/api/label-stations/${st.id}`, { method: 'DELETE' });
    setBusy(false);
    await reload();
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-5">
      <PageHeader
        title="PDA — Stations d'étiquettes"
        subtitle="Terminaux portables (PDA) dédiés à l'impression d'étiquettes, rattachés à une boutique."
        actions={null}
      />

      <div className="card p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink mb-1">Comment ajouter un PDA à une boutique&nbsp;?</p>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Sur le PDA, ouvrez <code className="bg-gray-100 px-1 rounded">pda.</code> (votre sous-domaine d&apos;étiquettes).</li>
          <li>Connectez-vous avec un code PIN.</li>
          <li>Choisissez la boutique&nbsp;: le PDA n&apos;affichera alors que les articles de cette boutique.</li>
        </ol>
        <p className="mt-2">Le PDA apparaît ensuite ci-dessous, où vous pouvez le renommer, le réaffecter ou le dissocier.</p>
      </div>

      {stations === null ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : (
        <div className="space-y-4">
          {stores.map((store) => {
            const list = byStore.get(store.id) ?? [];
            return (
              <div key={store.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">{store.name}</h3>
                  <span className="text-xs text-ink-soft">{list.length} PDA</span>
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-ink-soft/70">Aucun PDA rattaché à cette boutique.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {list.map((st) => (
                      <li key={st.id} className="py-2 flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{st.name}</div>
                          <div className="text-xs text-ink-soft">
                            {st.last_seen_at
                              ? `Vu le ${new Date(st.last_seen_at).toLocaleString('fr-FR')}`
                              : 'Jamais vu'}
                            {' · '}<span className="font-mono">{st.device_id.slice(0, 8)}…</span>
                          </div>
                        </div>
                        {canWrite && (
                          <div className="flex items-center gap-1.5">
                            <select
                              className="input h-9 text-sm" value={st.store_id} disabled={busy}
                              onChange={(e) => void reassign(st, e.target.value)}
                              title="Réaffecter à une boutique"
                            >
                              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <button className="btn-soft h-9 px-2 text-sm" disabled={busy} onClick={() => void rename(st)}>
                              Renommer
                            </button>
                            <button className="btn-soft h-9 px-2 text-sm text-danger" disabled={busy} onClick={() => void remove(st)}>
                              Dissocier
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Appairage : code + QR pour connecter un PDA à cette boutique. */}
                {canWrite && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {(() => {
                      const p = pairing[store.id];
                      if (p === undefined) {
                        return (
                          <button className="btn-soft h-9 px-3 text-sm" onClick={() => void showPairing(store.id)}>
                            🔑 Code d&apos;appairage PDA
                          </button>
                        );
                      }
                      if (p === 'loading') return <p className="text-sm text-ink-soft">…</p>;
                      return (
                        <div className="flex flex-wrap items-center gap-4">
                          {p.qr && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.qr} alt="QR d'appairage" className="h-28 w-28 rounded-lg border border-border bg-white" />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs text-ink-soft">Code d&apos;appairage</div>
                            {p.code ? (
                              <div className="text-2xl font-mono font-bold tracking-widest">{p.code}</div>
                            ) : (
                              <div className="text-sm text-ink-soft">Aucun code — générez-en un.</div>
                            )}
                            <p className="mt-1 text-xs text-ink-soft max-w-xs">
                              Sur chaque PDA (<code>pda.</code>), saisissez ce code ou scannez le QR pour
                              rattacher l&apos;appareil à « {store.name} ». <strong>Le même code
                              appaire autant de PDA que nécessaire</strong> — chacun apparaît ici
                              séparément.
                            </p>
                            <button className="btn-soft h-8 px-2 text-sm mt-2" onClick={() => void generatePairing(store.id)}>
                              {p.code ? 'Régénérer' : 'Générer le code'}
                            </button>
                            {p.code && (
                              <span className="ml-2 text-[11px] text-ink-soft">
                                (régénérer invalide l&apos;ancien code)
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
