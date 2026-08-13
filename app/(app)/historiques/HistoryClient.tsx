'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import Icon from '@/components/Icon';
import { formatEUR } from '@/lib/services/money';
import type { DayHistory, HistoryEvent, HistoryGroup } from '@/lib/services/day-history';

interface Store { id: string; name: string }

const GROUPES: Array<{ cle: HistoryGroup | 'tout'; label: string }> = [
  { cle: 'tout',       label: 'Tout' },
  { cle: 'especes',    label: 'Espèces & tiroir' },
  { cle: 'ventes',     label: 'Ventes sensibles' },
  { cle: 'clotures',   label: 'Clôtures' },
  { cle: 'acces',      label: 'Accès & droits' },
  { cle: 'parametres', label: 'Paramètres' },
];

/** Pastille de chaque type d'événement : on repère la ligne avant de la lire. */
const ICONES: Record<HistoryGroup, 'cart' | 'card' | 'closures' | 'lock' | 'settings'> = {
  especes: 'card',
  ventes: 'cart',
  clotures: 'closures',
  acces: 'lock',
  parametres: 'settings',
};

export default function HistoryClient({ stores, lockedStoreId }: {
  stores: Store[]; lockedStoreId?: string | null;
}) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(aujourdhui);
  const [storeId, setStoreId] = useState<string>('');
  const [histoire, setHistoire] = useState<DayHistory | null>(null);
  const [chargement, setChargement] = useState(true);
  const [groupe, setGroupe] = useState<HistoryGroup | 'tout'>('tout');
  const [seulementSensibles, setSeulementSensibles] = useState(false);

  useEffect(() => {
    if (lockedStoreId) { setStoreId(lockedStoreId); return; }
    let sid = '';
    try { sid = localStorage.getItem('webpos_current_store_id') || ''; } catch { /* ignore */ }
    if (!sid || !stores.some((s) => s.id === sid)) sid = stores[0]?.id ?? '';
    setStoreId(sid);
  }, [stores, lockedStoreId]);

  useEffect(() => {
    if (!storeId) return;
    setChargement(true);
    void fetch(`/api/history/day?date=${date}&store_id=${encodeURIComponent(storeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHistoire(j?.history ?? null))
      .finally(() => setChargement(false));
  }, [date, storeId]);

  const evenements = useMemo(() => {
    const tous = histoire?.events ?? [];
    return tous.filter((e) =>
      (groupe === 'tout' || e.group === groupe) && (!seulementSensibles || e.attention),
    );
  }, [histoire, groupe, seulementSensibles]);

  const dateLongue = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const resume = histoire?.summary;

  return (
    <div className="flex flex-col min-h-full bg-bg">
      <div className="px-4 md:px-6 pt-3 md:pt-4 pb-3 shrink-0 border-b border-border bg-surface">
        <PageHeader
          title="Historiques"
          subtitle={`${dateLongue}${histoire?.store_name ? ` · ${histoire.store_name}` : ''}`}
          actions={
            <div className="flex items-center gap-2">
              {!lockedStoreId && stores.length > 1 && (
                <select className="input h-10 min-w-[170px] text-sm" value={storeId}
                        onChange={(e) => setStoreId(e.target.value)}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer relative rounded-xl bg-accent-soft px-3 h-10 text-sm font-medium text-accent-deep hover:brightness-95 whitespace-nowrap">
                <input
                  type="date" value={date} max={aujourdhui}
                  onChange={(e) => setDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Icon name="calendar" size={16} /> Changer de date
              </label>
            </div>
          }
        />
      </div>

      <div className="p-3 md:p-4 space-y-4">
        {/* Les chiffres que l'on vient vérifier, avant même de lire le détail. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Chiffre
            label="Ouvertures manuelles du tiroir"
            valeur={(resume?.drawer_opens ?? 0).toString()}
            note={resume && resume.drawer_by_person.length > 0
              ? resume.drawer_by_person.map((p) => `${p.person} (${p.count})`).join(', ')
              : 'Aucune'}
            alerte={(resume?.drawer_opens ?? 0) > 0}
          />
          <Chiffre
            label="Prélèvements"
            valeur={formatEUR(resume?.bank_deposits_total ?? 0)}
            note={`${resume?.bank_deposits_count ?? 0} prélèvement(s)`}
          />
          <Chiffre
            label="Écart de caisse"
            valeur={resume?.cash_variance == null ? '—' : formatEUR(resume.cash_variance)}
            note={resume?.cash_variance == null ? 'Caisse non fermée' : 'Compté − attendu'}
            alerte={resume?.cash_variance != null && Math.abs(resume.cash_variance) >= 0.01}
          />
          <Chiffre
            label="Points à surveiller"
            valeur={(resume?.sensitive_count ?? 0).toString()}
            note="Écarts, annulations, accès refusés"
            alerte={(resume?.sensitive_count ?? 0) > 0}
          />
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          {GROUPES.map((g) => (
            <button
              key={g.cle}
              onClick={() => setGroupe(g.cle)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium border transition-colors ${
                groupe === g.cle
                  ? 'accent-bar text-white border-transparent'
                  : 'bg-surface text-ink border-border hover:border-gray-300'
              }`}
            >
              {g.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-sm text-ink-soft cursor-pointer">
            <input type="checkbox" checked={seulementSensibles}
                   onChange={(e) => setSeulementSensibles(e.target.checked)} />
            Seulement les points à surveiller
          </label>
        </div>

        {/* Journal */}
        {chargement ? (
          <div className="card p-8 text-center text-sm text-ink-soft">Chargement…</div>
        ) : evenements.length === 0 ? (
          <div className="card p-10">
            <EmptyState
              icon="☼"
              title="Aucun événement"
              description={histoire && histoire.events.length > 0
                ? 'Aucun événement pour ce filtre.'
                : 'Rien n\'a été enregistré ce jour-là pour cette boutique.'}
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <ul className="divide-y divide-border">
              {evenements.map((e, i) => <Ligne key={`${e.at}-${i}`} evenement={e} />)}
            </ul>
          </div>
        )}

        <p className="text-xs text-ink-soft">
          Le journal reprend les faits enregistrés : ouvertures et fermetures de caisse,
          mouvements d&apos;espèces, ouvertures du tiroir, annulations et retours, clôtures,
          accès refusés et réglages sensibles. Les réglages et les accès valent pour
          l&apos;organisation entière, ils ne sont pas rattachés à une boutique.
        </p>
      </div>
    </div>
  );
}

function Ligne({ evenement }: { evenement: HistoryEvent }) {
  const heure = new Date(evenement.at).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit',
  });
  const montant = evenement.amount;
  return (
    <li className={`px-4 py-3 flex items-start gap-3 ${evenement.attention ? 'bg-warning/5' : ''}`}>
      <span className="text-sm tabular-nums text-ink-soft w-12 shrink-0 pt-0.5">{heure}</span>
      <span className={`h-8 w-8 shrink-0 rounded-full grid place-items-center ${
        evenement.attention ? 'bg-warning/15 text-warning' : 'bg-muted text-accent-deep'
      }`}>
        <Icon name={ICONES[evenement.group]} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{evenement.label}</div>
        <div className="text-xs text-ink-soft">
          {evenement.person ?? 'Utilisateur inconnu'}
          {evenement.detail ? ` · ${evenement.detail}` : ''}
        </div>
      </div>
      {montant != null && (
        <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${
          montant < 0 ? 'text-warning' : ''
        }`}>
          {montant < 0 ? `-${formatEUR(Math.abs(montant))}` : formatEUR(montant)}
        </span>
      )}
    </li>
  );
}

function Chiffre({ label, valeur, note, alerte }: {
  label: string; valeur: string; note: string; alerte?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${
        alerte ? 'text-warning' : ''
      }`}>{valeur}</div>
      <div className="mt-0.5 text-[11px] text-ink-soft truncate" title={note}>{note}</div>
    </div>
  );
}
