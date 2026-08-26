'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatEUR } from '@/lib/services/money';

export default function OpenSessionModal({
  storeId, registerId, onClose, onOpened,
}: { storeId: string; registerId: string; onClose: () => void; onOpened: () => void }) {
  const router = useRouter();
  const [openingFloatStr, setOpeningFloatStr] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{
    mode: 'manual' | 'fixed' | 'previous_close';
    amount: number | null;
    fallback?: number;
  } | null>(null);
  // Fonds commun : le montant saisi vaut pour TOUTE la boutique, les autres
  // postes n'auront rien à ouvrir. À dire avant la saisie, pas après.
  const [sharedFloat, setSharedFloat] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/cash-sessions/suggest-float?register_id=${registerId}&store_id=${encodeURIComponent(storeId)}`);
      if (!r.ok) return;
      const j = await r.json();
      setSuggestion(j);
      // Pré-remplit uniquement si une valeur a été configurée
      if (j.mode === 'fixed' && j.amount > 0) setOpeningFloatStr(String(j.amount));
      else if (j.mode === 'previous_close' && j.amount != null) setOpeningFloatStr(String(j.amount));
      // 'manual' → reste vide pour saisie libre
    })();
  }, [registerId]);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/settings/cash?store_id=${encodeURIComponent(storeId)}`);
      if (!r.ok) return;
      setSharedFloat(Boolean((await r.json()).settings?.shared_float));
    })();
  }, [storeId]);

  function press(key: string) {
    setError(null);
    setOpeningFloatStr((cur) => {
      if (key === 'C') return '';
      if (key === '⌫') return cur.slice(0, -1);
      if (key === '.') {
        if (cur.includes('.') || cur.length === 0) return cur || '0.';
        return cur + '.';
      }
      // chiffres : le 0 initial est remplacé
      if (cur === '0') return key;
      return cur + key;
    });
  }

  // Clavier physique
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === 'INPUT') return; // l'input gère lui-même
      if (e.key >= '0' && e.key <= '9') { press(e.key); e.preventDefault(); }
      else if (e.key === '.' || e.key === ',') { press('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault(); }
      else if (e.key === 'Escape') { onClose(); }
      else if (e.key === 'Enter') { void submit(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openingFloatStr]);

  async function submit() {
    const openingFloat = Number(openingFloatStr || '0');
    if (openingFloat < 0) { setError('Montant invalide'); return; }
    setLoading(true); setError(null);
    let res: Response;
    try {
      res = await fetch('/api/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, register_id: registerId, opening_float: openingFloat }),
      });
    } catch {
      setLoading(false);
      setError('Réseau indisponible');
      return;
    }
    setLoading(false);
    if (res.status === 401) {
      // Session expirée : on renvoie vers la page de connexion
      router.push('/login');
      router.refresh();
      return;
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.error === 'DAY_SEALED') {
        setError('Journée déjà fermée : la réouverture est réservée à un responsable.');
        return;
      }
      setError(j.message ?? j.error ?? 'Erreur d\'ouverture');
      return;
    }
    onOpened();
  }

  const value = openingFloatStr === '' ? 0 : Number(openingFloatStr);
  // Fond « Montant fixe » : pas de saisie, juste confirmation puis ouverture.
  const isFixed = suggestion?.mode === 'fixed';

  const suggestionLabel = (() => {
    if (!suggestion) return null;
    if (suggestion.mode === 'fixed') return `Fond fixe configuré : ${formatEUR(Number(suggestion.amount ?? 0))}`;
    if (suggestion.mode === 'previous_close') {
      if (suggestion.amount != null) return `Solde compté lors de la dernière clôture : ${formatEUR(suggestion.amount)}`;
      return 'Aucune clôture précédente — saisissez manuellement.';
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {sharedFloat ? 'Ouverture de la boutique' : 'Ouverture caisse'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="h-10 w-10 grid place-items-center rounded-lg text-lg text-ink-soft hover:bg-gray-100 hover:text-ink"
          >✕</button>
        </div>

        <p className="mt-1 text-sm text-ink-soft">
          {isFixed
            ? 'Fond de caisse fixe défini dans les réglages. Confirmez pour ouvrir la caisse.'
            : 'Confirmez le fond de caisse présent dans le tiroir avant de démarrer.'}
        </p>

        {suggestionLabel && (
          <div className="mt-3 rounded-xl border border-border bg-gray-50 px-3 py-2 text-xs text-ink-soft">
            {suggestionLabel}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border p-4 bg-gray-50">
          <div className="text-xs uppercase tracking-wider text-ink-soft">
            {sharedFloat ? 'Fond de caisse commun' : 'Fond de caisse'}
          </div>
          {sharedFloat && (
            <p className="mt-1 text-xs text-ink-soft">
              Ce montant vaut pour toute la boutique : les autres caisses
              n&apos;auront rien à ouvrir.
            </p>
          )}
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-4xl font-semibold tabular-nums">
              {openingFloatStr === '' ? '—' : formatEUR(value)}
            </span>
            {!isFixed && (
              <button onClick={() => setOpeningFloatStr('')} className="text-xs text-ink-soft hover:text-ink">
                Effacer
              </button>
            )}
          </div>
        </div>

        {/* Pavé numérique — masqué en mode « fond fixe ». */}
        {!isFixed && (
          <div className="mt-3 grid grid-cols-3 gap-2 lg:gap-3">
            {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                className="h-16 lg:h-20 rounded-xl border border-border bg-white text-2xl lg:text-3xl font-medium hover:bg-gray-50 active:scale-95 transition"
              >
                {k}
              </button>
            ))}
          </div>
        )}

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <button
          disabled={loading}
          onClick={() => void submit()}
          className="btn-primary w-full mt-4 h-16 text-lg font-semibold"
        >
          {loading
            ? 'Ouverture…'
            : `${sharedFloat ? 'Ouvrir la boutique' : 'Ouvrir la caisse'} · ${formatEUR(value)}`}
        </button>

        <p className="mt-3 text-xs text-ink-soft">
          Mode d&apos;ouverture (manuel / fixe / solde de la veille) configurable dans les paramètres.
        </p>
      </div>
    </div>
  );
}
