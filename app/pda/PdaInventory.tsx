'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Module inventaire du PDA — phase de COMPTAGE.
 *
 * Flux : l'inventaire est CRÉÉ sur la caisse (général ou par catégorie), le
 * COMPTAGE se fait ici au PDA (scan douchette → +1, ou saisie manuelle), puis
 * « Valider le comptage » bascule l'inventaire en pointage. On retrouve alors
 * le comptage et les écarts sur la caisse pour validation finale.
 *
 * Comptage « à l'aveugle » : on n'affiche pas la quantité théorique pour ne pas
 * biaiser le comptage — les écarts apparaissent côté caisse.
 */

interface Inv {
  id: string; label: string; store_id: string; store_name: string;
  scope_type: 'total' | 'category' | 'supplier'; scope_ids: string[];
  status: string; created_at: string; line_count: number;
}
interface Line {
  id: string; product_id: string; product_name: string;
  sku: string | null; barcode: string | null;
  counted_qty: string;
}

export default function PdaInventory({
  storeId, storeName, onClose, onCounted,
}: {
  storeId: string;
  storeName: string;
  onClose: () => void;
  onCounted?: (label: string) => void;
}) {
  const [view, setView] = useState<'list' | 'count'>('list');
  const [invs, setInvs] = useState<Inv[] | null>(null);
  const [current, setCurrent] = useState<Inv | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editStr, setEditStr] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Liste des inventaires à compter (in_progress, boutique du PDA) ----
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inventories');
      if (r.ok) {
        const j = await r.json() as { inventories: Inv[] };
        setInvs(j.inventories.filter((i) => i.store_id === storeId && i.status === 'in_progress'));
      } else setInvs([]);
    } catch { setInvs([]); }
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void loadList(); }, [loadList]);

  async function openInv(inv: Inv) {
    setCurrent(inv); setView('count'); setLoading(true); setMsg(null); setFilter('');
    try {
      const r = await fetch(`/api/inventories/${inv.id}`);
      if (r.ok) {
        const j = await r.json() as { lines: Line[] };
        setLines(j.lines);
      }
    } catch { /* ignore */ }
    setLoading(false);
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  function backToList() {
    setView('list'); setCurrent(null); setLines([]); setMsg(null); setFilter('');
    void loadList();
  }

  // ---- Scan → +1 sur la ligne ----
  const doScan = useCallback(async (code: string) => {
    if (!current || !code.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), delta: 1 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(j.error === 'PRODUCT_NOT_FOUND' ? '❌ Article introuvable pour ce code.' : '❌ Échec du scan.');
      } else {
        const l = j.line as { id: string; counted_qty: string; product_name: string };
        setLines((cur) => {
          const idx = cur.findIndex((x) => x.id === l.id);
          if (idx >= 0) {
            const next = [...cur];
            next[idx] = { ...next[idx]!, counted_qty: l.counted_qty };
            return next;
          }
          // Ligne hors périmètre initial créée par le scan : on la rajoute.
          return [{ id: l.id, product_id: '', product_name: l.product_name, sku: null, barcode: null, counted_qty: l.counted_qty }, ...cur];
        });
        setMsg(`✓ ${l.product_name} — ${Number(l.counted_qty)} compté(s)`);
      }
    } finally {
      setBusy(false);
      setTimeout(() => scanRef.current?.focus(), 30);
    }
  }, [current]);

  // ---- Saisie manuelle d'une quantité (tap sur une ligne) ----
  function openEdit(l: Line) {
    setEditLine(l); setEditStr(String(Number(l.counted_qty) || ''));
  }
  function pressKey(k: string) {
    setEditStr((cur) => {
      if (k === 'C') return '';
      if (k === '⌫') return cur.slice(0, -1);
      const next = (cur + k).replace(/^0+(?=\d)/, '');
      return next.length > 5 ? cur : next;
    });
  }
  async function saveEdit() {
    if (!current || !editLine) return;
    const qty = Number(editStr || '0') || 0;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/lines/${editLine.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counted_qty: qty }),
      });
      if (r.ok) {
        setLines((cur) => cur.map((x) => (x.id === editLine.id ? { ...x, counted_qty: String(qty) } : x)));
        setMsg(`✓ ${editLine.product_name} — ${qty} compté(s)`);
        setEditLine(null);
      } else setMsg('❌ Échec de la mise à jour.');
    } finally { setBusy(false); }
  }

  // ---- Valider le comptage → passe en pointage (visible sur la caisse) ----
  async function validate() {
    if (!current) return;
    const label = current.label;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/review`, { method: 'POST' });
      if (r.ok) {
        onCounted?.(label);
        backToList();
        setMsg(`✅ Comptage « ${label} » validé. Écarts disponibles sur la caisse.`);
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(j.error === 'INVENTORY_NOT_IN_PROGRESS' ? '❌ Cet inventaire n\'est plus en comptage.' : '❌ Échec de la validation.');
      }
    } finally { setBusy(false); }
  }

  const countedTotal = useMemo(() => lines.filter((l) => Number(l.counted_qty) > 0).length, [lines]);
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const src = q
      ? lines.filter((l) => l.product_name.toLowerCase().includes(q)
          || (l.sku?.toLowerCase().includes(q) ?? false)
          || (l.barcode?.toLowerCase().includes(q) ?? false))
      // Sans recherche : on montre les articles déjà comptés (progression).
      : lines.filter((l) => Number(l.counted_qty) > 0);
    return src.slice(0, 300);
  }, [lines, filter]);

  const header = (title: string, onBack: () => void) => (
    <header className="shrink-0 border-b border-border bg-surface flex items-center gap-3 px-4"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(3.5rem + env(safe-area-inset-top, 0px))' }}>
      <button onClick={onBack} className="text-sm text-accent-deep hover:underline">← Retour</button>
      <div className="flex-1 text-center font-semibold truncate">{title}</div>
      <div className="w-14" />
    </header>
  );

  // ===== Liste des inventaires =====
  if (view === 'list') {
    return (
      <div className="h-screen flex flex-col bg-bg text-ink overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {header('Inventaire', onClose)}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          <p className="text-sm text-ink-soft">
            Boutique : <strong>{storeName}</strong>. Les inventaires se créent sur la caisse ;
            le comptage se fait ici.
          </p>
          {msg && <div className="card p-3 text-sm text-center">{msg}</div>}
          {loading || invs === null ? (
            <div className="p-6 text-sm text-ink-soft text-center">Chargement…</div>
          ) : invs.length === 0 ? (
            <div className="card p-6 text-sm text-ink-soft text-center">
              Aucun inventaire à compter. Créez-en un sur la caisse (Inventaire ▸ Nouvel inventaire).
            </div>
          ) : (
            <ul className="space-y-2">
              {invs.map((i) => (
                <li key={i.id}>
                  <button onClick={() => void openInv(i)}
                    className="card w-full text-left p-4 active:scale-[0.99] transition-transform">
                    <div className="font-semibold leading-tight">{i.label}</div>
                    <div className="text-xs text-ink-soft mt-0.5">
                      {i.scope_type === 'total' ? 'Général (tous les articles)'
                        : i.scope_type === 'category' ? 'Par catégorie'
                        : 'Par fournisseur'} · {i.line_count} article(s)
                    </div>
                    <div className="text-xs text-ink-soft mt-0.5">
                      Créé le {new Date(i.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ===== Écran de comptage =====
  return (
    <div className="h-screen flex flex-col bg-bg text-ink overflow-hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {header(current?.label ?? 'Comptage', backToList)}

      {/* Zone scan */}
      <div className="shrink-0 p-3 border-b border-border bg-surface">
        <div className="text-xs text-ink-soft mb-1">Scanner un article (douchette) ou saisir un code</div>
        <input
          ref={scanRef}
          className="input h-12 w-full text-base font-mono"
          placeholder="Code-barres / SKU…"
          autoComplete="off" autoFocus
          onBlur={() => setTimeout(() => { if (view === 'count' && !editLine) scanRef.current?.focus(); }, 60)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const el = e.currentTarget; const v = el.value; el.value = '';
            if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
            if (v.trim()) void doScan(v);
          }}
          onInput={(e) => {
            // Douchette en mode « injection » : lecture de la valeur sans dépendre
            // des frappes. Fin = retour/tab collé → immédiat ; sinon anti-rebond.
            const el = e.currentTarget; const val = el.value;
            const nl = val.search(/[\r\n\t]/);
            if (nl >= 0) {
              const code = val.slice(0, nl); el.value = '';
              if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
              if (code.trim()) void doScan(code);
              return;
            }
            if (scanTimer.current) clearTimeout(scanTimer.current);
            scanTimer.current = setTimeout(() => {
              const code = el.value;
              if (code.trim().length >= 4) { el.value = ''; void doScan(code); }
            }, 150);
          }}
        />
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-ink-soft">{countedTotal} article(s) compté(s)</span>
          {busy && <span className="text-ink-soft">…</span>}
        </div>
        {msg && <div className="mt-1 text-sm">{msg}</div>}
      </div>

      {/* Recherche + liste */}
      <div className="shrink-0 px-3 py-2 border-b border-border">
        <input className="input h-10 w-full" placeholder="Rechercher un article à corriger…"
          value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-sm text-ink-soft text-center">Chargement…</div>
        ) : visible.length === 0 ? (
          <div className="p-6 text-sm text-ink-soft text-center">
            {filter.trim() ? 'Aucun article trouvé.' : 'Scannez un article pour démarrer le comptage.'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((l) => (
              <li key={l.id}>
                <button onClick={() => openEdit(l)} className="w-full text-left px-3 py-3 flex items-center gap-3 active:bg-gray-100">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{l.product_name}</div>
                    <div className="text-xs text-ink-soft truncate">{l.barcode ?? l.sku ?? '— pas de code —'}</div>
                  </div>
                  <div className="text-lg font-semibold tabular-nums shrink-0">{Number(l.counted_qty)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Valider */}
      <div className="shrink-0 p-3 border-t border-border bg-surface">
        <button onClick={() => void validate()} disabled={busy}
          className="btn-primary h-14 w-full text-base font-semibold">
          Valider le comptage
        </button>
        <p className="mt-1 text-center text-[11px] text-ink-soft">
          Les écarts seront visibles sur la caisse pour validation finale.
        </p>
      </div>

      {/* Clavier de saisie manuelle */}
      {editLine && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink/40" onClick={() => setEditLine(null)}>
          <div className="bg-surface rounded-t-2xl p-4" onClick={(e) => e.stopPropagation()}
               style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
            <div className="font-semibold leading-tight">{editLine.product_name}</div>
            <div className="text-xs text-ink-soft">Quantité comptée</div>
            <div className="mt-2 rounded-xl border border-border h-14 px-4 flex items-center justify-end text-3xl font-semibold tabular-nums bg-white">
              {editStr === '' ? <span className="text-ink-soft/40">0</span> : editStr}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((k) => (
                <button key={k} onClick={() => pressKey(k)}
                  className={`h-14 rounded-xl text-xl font-semibold ${
                    k === 'C' ? 'bg-danger/10 text-danger'
                    : k === '⌫' ? 'bg-gray-100 text-ink-soft'
                    : 'bg-gray-50 border border-border'}`}>{k}</button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setEditLine(null)} className="btn-soft h-12">Annuler</button>
              <button onClick={() => void saveEdit()} disabled={busy} className="btn-primary h-12">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
