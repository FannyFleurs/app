'use client';

import { useEffect, useState } from 'react';

interface Batch {
  started_at: string;
  ended_at: string;
  count: number;
  total_points: number;
  sample_customers: string[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Corrige un import de points de fidélité fait avec la mauvaise colonne.
 * L'import est CUMULATIF (ajouté au solde, jamais remplacé) — on ne peut
 * donc pas juste réimporter le bon fichier par-dessus sans d'abord annuler
 * les mauvais points. Chaque lot (= un import) est listé séparément : on
 * laisse l'utilisateur choisir LEQUEL annuler, pour ne jamais toucher un
 * import antérieur ou postérieur resté correct.
 */
export default function CustomerLoyaltyRevertModal({ onClose, onDone }: {
  onClose: () => void; onDone: () => void;
}) {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Batch | null>(null);
  const [reverting, setReverting] = useState(false);
  const [done, setDone] = useState<{ reverted_count: number; total_points_reverted: number } | null>(null);

  useEffect(() => {
    void fetch('/api/customers/import/loyalty-batches')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setBatches(j.batches ?? []))
      .catch(() => setError('Impossible de charger les imports.'));
  }, []);

  async function revert(b: Batch) {
    setReverting(true); setError(null);
    try {
      const r = await fetch('/api/customers/import/loyalty-revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ started_at: b.started_at, ended_at: b.ended_at }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setError(j?.message ?? j?.error ?? 'Échec de l’annulation.'); setReverting(false); return; }
      setDone(j);
      onDone();
    } catch {
      setError('Erreur réseau.');
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !reverting && onClose()}>
      <div className="card w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">Corriger un import de points fidélité</h3>
          <button onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {!done ? (
          <>
            <p className="text-sm text-ink-soft">
              Les points importés s&apos;ajoutent au solde existant, ils ne le remplacent jamais.
              Pour corriger un import fait avec la mauvaise colonne, annulez-le ci-dessous puis
              réimportez le fichier corrigé (Clients → Importer) : les bons points s&apos;ajouteront
              sur un solde reparti de zéro.
            </p>

            {confirming ? (
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 space-y-3">
                <p className="text-sm">
                  Annuler cet import du <strong>{fmtDate(confirming.started_at)}</strong> :
                  retire <strong>{confirming.total_points} point(s)</strong> sur <strong>{confirming.count} compte(s)</strong>.
                  Action tracée et réversible (nouvel import possible ensuite), mais à confirmer.
                </p>
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary h-9 px-3 text-sm" disabled={reverting} onClick={() => setConfirming(null)}>
                    Annuler
                  </button>
                  <button
                    className="h-9 px-3 text-sm rounded-xl font-medium text-white bg-danger hover:opacity-90 disabled:opacity-50"
                    disabled={reverting}
                    onClick={() => void revert(confirming)}
                  >
                    {reverting ? 'Annulation…' : 'Confirmer l’annulation'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {batches === null && !error && <p className="text-sm text-ink-soft">Chargement…</p>}
                {error && <p className="text-sm text-danger">{error}</p>}
                {batches && batches.length === 0 && (
                  <p className="text-sm text-ink-soft">Aucun import de points fidélité à annuler.</p>
                )}
                {batches && batches.length > 0 && (
                  <div className="space-y-2">
                    {batches.map((b) => (
                      <div key={b.started_at} className="rounded-xl border border-border p-3 text-sm flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">{fmtDate(b.started_at)}</div>
                          <div className="text-ink-soft text-xs mt-0.5">
                            {b.count} compte(s) · {b.total_points > 0 ? '+' : ''}{b.total_points} point(s) au total
                          </div>
                          <div className="text-ink-soft text-xs truncate">
                            {b.sample_customers.join(', ')}{b.count > b.sample_customers.length ? '…' : ''}
                          </div>
                        </div>
                        <button className="btn-soft h-8 px-3 text-xs shrink-0" onClick={() => setConfirming(b)}>
                          Annuler ce lot
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-deep">
              <div className="font-semibold">Import annulé</div>
              <p className="mt-1">
                {done.reverted_count} compte(s) corrigé(s), {done.total_points_reverted} point(s) retirés.
                Vous pouvez maintenant réimporter le fichier avec la bonne colonne fidélité.
              </p>
            </div>
            <div className="flex justify-end">
              <button className="btn-primary h-10 px-4" onClick={onClose}>Fermer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
