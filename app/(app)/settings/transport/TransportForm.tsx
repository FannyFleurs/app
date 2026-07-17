'use client';

import { useEffect, useState } from 'react';

interface Cat {
  id: string;
  name: string;
  transport_cost_ht: number;
  input: string;   // saisie en cours
  saving: boolean;
  saved: boolean;
}

const parseNum = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function TransportForm({ canEdit }: { canEdit: boolean }) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/categories');
      if (r.ok) {
        const list = (await r.json()).categories as Array<{ id: string; name: string; transport_cost_ht: number }>;
        setCats(list.map((c) => ({
          id: c.id, name: c.name,
          transport_cost_ht: Number(c.transport_cost_ht ?? 0),
          input: c.transport_cost_ht ? String(Number(c.transport_cost_ht)) : '',
          saving: false, saved: false,
        })));
      }
      setLoading(false);
    })();
  }, []);

  function edit(id: string, v: string) {
    setCats((cur) => cur.map((c) => (c.id === id ? { ...c, input: v, saved: false } : c)));
  }
  async function save(id: string) {
    const c = cats.find((x) => x.id === id);
    if (!c) return;
    setCats((cur) => cur.map((x) => (x.id === id ? { ...x, saving: true } : x)));
    const r = await fetch(`/api/categories/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transport_cost_ht: parseNum(c.input) }),
    });
    setCats((cur) => cur.map((x) => (x.id === id
      ? { ...x, saving: false, saved: r.ok, transport_cost_ht: parseNum(c.input) }
      : x)));
    if (r.ok) setTimeout(() => setCats((cur) => cur.map((x) => (x.id === id ? { ...x, saved: false } : x))), 2000);
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coûts de transport</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Coût de transport HT par défaut de chaque catégorie. Il s&apos;ajoute au prix d&apos;achat
          dans le calcul de la marge. Modifiable article par article dans la fiche produit.
        </p>
      </div>

      <div className="card p-2">
        {loading ? (
          <p className="p-4 text-sm text-ink-soft">Chargement…</p>
        ) : cats.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft">Aucune catégorie.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-2 py-2">
                <span className="flex-1 font-medium text-sm truncate">{c.name}</span>
                <div className="relative">
                  <input
                    className="input h-9 w-28 text-right tabular-nums pr-6"
                    inputMode="decimal" placeholder="0"
                    value={c.input} disabled={!canEdit}
                    onChange={(e) => edit(c.id, e.target.value)}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-soft text-sm">€</span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => void save(c.id)}
                    disabled={c.saving}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold ${
                      c.saved ? 'bg-success text-white' : 'btn-primary'
                    }`}
                    title="Enregistrer"
                  >
                    {c.saving ? '…' : '✓'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
