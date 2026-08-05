'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Station } from './PdaApp';
import { useScanField } from './scan';
import {
  Screen, Header, Tabs, ScanField, QtyPad, ActionBar, Toast, InfoRow, IconChevron,
} from './ui';

/**
 * Inventaire — phase de COMPTAGE.
 *
 * L'inventaire est créé sur la caisse (général, par catégorie ou par
 * fournisseur) ; le comptage se fait ici, puis « Clôturer l'inventaire »
 * bascule en pointage : les écarts se valident ensuite sur la caisse.
 *
 * Comptage à l'aveugle : la quantité théorique n'est volontairement pas
 * affichée, pour ne pas influencer le compteur. L'écart n'a de sens qu'une
 * fois le comptage terminé, et il est calculé côté caisse.
 *
 * Résolution du code : elle est faite par le SERVEUR (`/scan`), à partir du
 * code exact envoyé. Aucun repli local sur une liste filtrée — c'était la
 * cause des comptages attribués à l'article précédent.
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

/** Réponse d'erreur du scan, traduite pour l'opérateur. */
function scanErrorMessage(j: Record<string, unknown>, code: string): string {
  if (j.error === 'PRODUCT_NOT_FOUND') return `Article introuvable : « ${code} »`;
  if (j.error === 'PRODUCT_OUT_OF_SCOPE') {
    const name = typeof j.product_name === 'string' ? j.product_name : 'Cet article';
    const scope = typeof j.product_scope === 'string' ? j.product_scope : null;
    const kind = j.scope_type === 'supplier' ? 'fournisseur' : 'catégorie';
    return scope
      ? `⚠ ${name} n'est pas dans le périmètre — ${kind} « ${scope} ». Non compté.`
      : `⚠ ${name} n'est pas dans le périmètre de cet inventaire. Non compté.`;
  }
  if (j.error === 'INVENTORY_LOCKED') return "Cet inventaire n'accepte plus de comptage.";
  return 'Échec du scan.';
}

export default function PdaInventory({ station, onHome, notify }: {
  station: Station;
  onHome: () => void;
  notify: (text: string, tone?: 'ok' | 'error') => void;
}) {
  const [invs, setInvs] = useState<Inv[] | null>(null);
  const [current, setCurrent] = useState<Inv | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<'list' | 'summary'>('list');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Line | null>(null);
  const [editValue, setEditValue] = useState('');

  // Le comptage est envoyé au serveur : on sérialise les scans pour éviter
  // que deux douchettes rapides ne se croisent sur la même ligne.
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  /* ----------------------------------------------- liste des inventaires */

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/inventories', { cache: 'no-store' });
      const j = r.ok ? (await r.json()) as { inventories: Inv[] } : { inventories: [] };
      setInvs(j.inventories.filter((i) => i.store_id === station.store_id && i.status === 'in_progress'));
    } catch { setInvs([]); }
    setLoading(false);
  }, [station.store_id]);

  useEffect(() => { void loadList(); }, [loadList]);

  async function open(inv: Inv) {
    setCurrent(inv); setLoading(true); setMessage(null); setTab('list'); clearField();
    try {
      const r = await fetch(`/api/inventories/${inv.id}`, { cache: 'no-store' });
      if (r.ok) setLines(((await r.json()) as { lines: Line[] }).lines);
    } catch { /* ignore */ }
    setLoading(false);
    setTimeout(focusField, 80);
  }

  function back() {
    setCurrent(null); setLines([]); setMessage(null); clearField();
    void loadList();
  }

  /* ------------------------------------------------------------- comptage */

  const countCode = useCallback(async (code: string) => {
    if (!current) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, delta: 1 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage({ text: scanErrorMessage(j, code), tone: 'error' });
        return;
      }
      const l = j.line as { id: string; counted_qty: string; product_name: string };
      setLines((cur) => {
        const i = cur.findIndex((x) => x.id === l.id);
        if (i < 0) {
          // Inventaire général : un article absent du pré-remplissage est
          // ajouté par le scan. Sur un inventaire par catégorie ou par
          // fournisseur, le serveur refuse en amont (PRODUCT_OUT_OF_SCOPE).
          return [{
            id: l.id, product_id: '', product_name: l.product_name,
            sku: null, barcode: null, counted_qty: l.counted_qty,
          }, ...cur];
        }
        const next = [...cur];
        next[i] = { ...next[i]!, counted_qty: l.counted_qty };
        return next;
      });
      setMessage({ text: `✓ ${l.product_name} — ${Number(l.counted_qty)} compté(s)`, tone: 'ok' });
    } finally {
      setBusy(false);
    }
  }, [current]);

  const handleCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code || !current) return;
    // Mise en file : les scans sont appliqués dans l'ordre où ils arrivent.
    chainRef.current = chainRef.current.then(() => countCode(code)).catch(() => {});
  }, [current, countCode]);

  // Scan actif uniquement sur l'écran de comptage, et pas pendant la saisie
  // d'une quantité au pavé numérique.
  const field = useScanField({
    onCode: handleCode,
    onSearch: setSearch,
    enabled: current !== null && edit === null,
  });
  const { clear: clearField, focus: focusField } = field;

  /* --------------------------------------------------- saisie manuelle */

  async function saveEdit() {
    if (!current || !edit) return;
    const qty = Math.max(0, parseInt(editValue || '0', 10) || 0);
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/lines/${edit.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counted_qty: qty }),
      });
      if (r.ok) {
        setLines((cur) => cur.map((x) => (x.id === edit.id ? { ...x, counted_qty: String(qty) } : x)));
        setMessage({ text: `✓ ${edit.product_name} — ${qty} compté(s)`, tone: 'ok' });
        setEdit(null);
        setTimeout(focusField, 30);
      } else {
        setMessage({ text: 'Échec de la mise à jour.', tone: 'error' });
      }
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------ clôture */

  async function close() {
    if (!current) return;
    const label = current.label;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventories/${current.id}/review`, { method: 'POST' });
      if (r.ok) {
        notify(`Comptage « ${label} » clôturé. Écarts disponibles sur la caisse.`);
        back();
      } else {
        const j = await r.json().catch(() => ({}));
        setMessage({
          text: j.error === 'INVENTORY_NOT_IN_PROGRESS'
            ? "Cet inventaire n'est plus en comptage."
            : 'Échec de la clôture.',
          tone: 'error',
        });
      }
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------ dérivés */

  const counted = useMemo(() => lines.filter((l) => Number(l.counted_qty) > 0), [lines]);
  const totalUnits = useMemo(
    () => counted.reduce((s, l) => s + Number(l.counted_qty), 0),
    [counted],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Sans recherche, on montre la progression : les articles déjà comptés.
    const src = q
      ? lines.filter((l) => l.product_name.toLowerCase().includes(q)
          || (l.sku?.toLowerCase().includes(q) ?? false)
          || (l.barcode?.toLowerCase().includes(q) ?? false))
      : counted;
    return src.slice(0, 300);
  }, [lines, counted, search]);

  /* ------------------------------------------------- choix de l'inventaire */

  if (!current) {
    return (
      <Screen>
        <Header title="Inventaire" onBack={onHome} onHome={onHome} />
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          <p className="text-sm text-ink-soft px-1">
            Boutique : <strong className="text-ink">{station.store_name}</strong>. Les inventaires
            se créent sur la caisse ; le comptage se fait ici.
          </p>
          {loading || invs === null ? (
            <p className="pt-10 text-center text-sm text-ink-soft">Chargement…</p>
          ) : invs.length === 0 ? (
            <div className="card p-6 text-center text-sm text-ink-soft">
              Aucun inventaire à compter.<br />
              Créez-en un sur la caisse (Inventaire ▸ Nouvel inventaire).
            </div>
          ) : (
            invs.map((i) => (
              <button key={i.id} onClick={() => void open(i)}
                      className="card w-full flex items-center gap-3 p-3 text-left active:scale-[0.99] transition-transform">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight truncate">{i.label}</span>
                  <span className="block text-xs text-ink-soft">
                    {i.scope_type === 'total' ? 'Général (tous les articles)'
                      : i.scope_type === 'category' ? 'Par catégorie' : 'Par fournisseur'}
                    {' · '}{i.line_count} article(s)
                  </span>
                  <span className="block text-xs text-ink-soft">
                    Créé le {new Date(i.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </span>
                <span className="shrink-0 text-ink-soft"><IconChevron /></span>
              </button>
            ))
          )}
        </div>
      </Screen>
    );
  }

  /* --------------------------------------------------------- comptage */

  return (
    <Screen>
      <Header title="Inventaire" onBack={back} onHome={onHome} />

      <div className="shrink-0 p-3 bg-surface border-b border-border">
        <div className="text-xs text-ink-soft mb-1.5 truncate">
          Scanner un produit — {current.label}
        </div>
        <ScanField field={field} showClear={search.length > 0} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        items={[{ value: 'list', label: 'Liste' }, { value: 'summary', label: 'Synthèse' }]}
      />

      {tab === 'list' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <p className="pt-10 text-center text-sm text-ink-soft">Chargement…</p>
          ) : visible.length === 0 ? (
            <p className="pt-10 text-center text-sm text-ink-soft px-6">
              {search
                ? 'Aucun article ne correspond à cette recherche.'
                : 'Scannez un article pour démarrer le comptage.'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => { setEdit(l); setEditValue(String(Number(l.counted_qty) || '')); }}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left bg-surface active:bg-gray-100"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{l.product_name}</span>
                      <span className="block text-xs text-ink-soft truncate">
                        Réf. : {l.barcode ?? l.sku ?? '—'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] uppercase tracking-wide text-ink-soft">Compté</span>
                      <span className="block text-lg font-bold tabular-nums" style={{ color: 'var(--primary-deep)' }}>
                        {Number(l.counted_qty)}
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-soft"><IconChevron /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <div className="card divide-y divide-border">
            <div className="px-4 py-2.5 text-[11px] uppercase tracking-widest text-ink-soft font-semibold">
              Résumé du comptage
            </div>
            <InfoRow label="Inventaire" value={current.label} />
            <InfoRow label="Boutique" value={station.store_name} />
            <InfoRow label="Périmètre" value={
              current.scope_type === 'total' ? 'Général'
                : current.scope_type === 'category' ? 'Par catégorie' : 'Par fournisseur'
            } />
            <InfoRow label="Articles au périmètre" value={lines.length} />
            <InfoRow label="Articles comptés" value={counted.length} tone="success" />
            <InfoRow label="Unités comptées" value={totalUnits} tone="success" />
          </div>
          <p className="mt-3 px-1 text-xs text-ink-soft">
            Le comptage se fait à l&apos;aveugle : les quantités théoriques ne sont pas
            affichées ici pour ne pas influencer le comptage. Les écarts sont calculés
            et validés sur la caisse une fois l&apos;inventaire clôturé.
          </p>
        </div>
      )}

      {message && <Toast message={message.text} tone={message.tone} />}

      <ActionBar>
        <button
          onClick={() => void close()}
          disabled={busy || counted.length === 0}
          className="btn-primary h-14 w-full text-base font-semibold disabled:opacity-40"
        >
          {busy ? '…' : "Clôturer l'inventaire"}
        </button>
      </ActionBar>

      {edit && (
        <QtyPad
          title={edit.product_name}
          subtitle="Quantité comptée"
          value={editValue}
          onKey={(k) => setEditValue((cur) => {
            if (k === 'C') return '';
            if (k === '⌫') return cur.slice(0, -1);
            const next = (cur + k).replace(/^0+(?=\d)/, '');
            return next.length > 5 ? cur : next;
          })}
          onCancel={() => { setEdit(null); setTimeout(focusField, 30); }}
          onSave={() => void saveEdit()}
        />
      )}
    </Screen>
  );
}
