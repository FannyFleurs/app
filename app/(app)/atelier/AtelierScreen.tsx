'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

/**
 * Écran atelier : affichage plein écran des commandes différées et des
 * ventes retrait/livraison à préparer (option Écran & livraison).
 *
 *   - Section du haut : préparées (en attente de retrait / livraison).
 *   - Section du bas : à préparer / en cours de préparation.
 *   - Tuile violette = retrait, bleue = livraison, orange = en retard ou en
 *     cours, verte = préparée, liseré rouge = non payée (commande différée).
 *   - Préparer = attribuer un numéro à chaque composition.
 *   - Rafraîchissement automatique toutes les 30 s + au retour sur l'onglet.
 */

interface AtelierLine {
  line_index: number;
  label: string;
  quantity: number;
  prepared_number: string | null;
}

interface AtelierItem {
  source: 'order' | 'sale';
  id: string;
  status: string; // confirmed | in_preparation | ready
  pickup_or_delivery: string;
  requested_at: string | null;
  slot_label: string | null;
  total_amount: string;
  deposit_amount: string;
  recipient_name: string | null;
  internal_notes: string | null;
  card_message: string | null;
  payment_status: string | null;
  customer_name: string | null;
  store_name: string | null;
  number: string | null;
  lines: AtelierLine[];
}

const TONES = {
  pickup: 'bg-[#DDD3F1]',
  delivery: 'bg-[#CFE8EF]',
  late: 'bg-[#FFF1A8]',
  inProgress: 'bg-[#FFF1A8]',
  ready: 'bg-[#B3D98C]',
  readyPickup: 'bg-[#E6F4D6]',
} as const;

function dayOnly(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isLate(item: AtelierItem): boolean {
  const d = dayOnly(item.requested_at);
  if (!d) return false;
  const today = new Date();
  return d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function longDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isUnpaid(item: AtelierItem): boolean {
  // Commande différée sans encaissement Stripe : reste dû si pas payée.
  return item.source === 'order' && item.payment_status !== 'paid';
}

function tileTone(item: AtelierItem): { bg: string; legend: string; legendClass: string } {
  if (item.status === 'ready') {
    return {
      bg: item.pickup_or_delivery === 'pickup' ? TONES.readyPickup : TONES.ready,
      legend: 'Préparée', legendClass: 'text-[#27500A]',
    };
  }
  if (item.status === 'in_preparation') {
    return { bg: TONES.inProgress, legend: 'En cours', legendClass: 'text-[#8a6d00]' };
  }
  if (isLate(item)) {
    return { bg: TONES.late, legend: 'En retard', legendClass: 'text-[#8a6d00]' };
  }
  return {
    bg: item.pickup_or_delivery === 'pickup' ? TONES.pickup : TONES.delivery,
    legend: '', legendClass: '',
  };
}

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    fmt();
    const t = window.setInterval(fmt, 30000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="fixed z-[60] rounded-full bg-white/95 px-3 py-1.5 text-lg font-black shadow-md pointer-events-none"
         style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', right: 'calc(env(safe-area-inset-right, 0px) + 10px)' }}>
      {time}
    </div>
  );
}

export default function AtelierScreen({ stores }: { stores: { id: string; name: string }[] }) {
  const [items, setItems] = useState<AtelierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [storeId, setStoreId] = useState('');
  const [tileSize, setTileSize] = useState(220);
  const [prepareItem, setPrepareItem] = useState<AtelierItem | null>(null);
  const [deliverItem, setDeliverItem] = useState<AtelierItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Préférences locales (boutique + taille tuiles) persistées sur l'écran.
  useEffect(() => {
    try {
      const s = localStorage.getItem('webpos_atelier_store');
      if (s) setStoreId(s);
      const t = Number(localStorage.getItem('webpos_atelier_tile'));
      if (t >= 140 && t <= 420) setTileSize(t);
    } catch { /* ignore */ }
  }, []);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const qs = storeId ? `?store_id=${storeId}` : '';
      const r = await fetch(`/api/orders/atelier${qs}`);
      if (r.ok) setItems((await r.json()).items);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { void reload(); }, [reload]);

  // Auto-refresh 30 s + retour sur l'onglet.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload(true);
    }, 30000);
    function onVisible() {
      if (document.visibilityState === 'visible') void reload(true);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);

  async function act(item: AtelierItem, action: 'in_preparation' | 'ready' | 'delivered',
                     numbers?: { line_index: number; prepared_number: string }[]) {
    setSaving(true); setMessage('');
    try {
      const r = await fetch('/api/orders/atelier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source, id: item.id, action, numbers }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMessage(j.message ?? j.error ?? 'Erreur');
        return false;
      }
      await reload(true);
      return true;
    } finally { setSaving(false); }
  }

  const ready = useMemo(() => items.filter((i) => i.status === 'ready'), [items]);
  const toPrepare = useMemo(
    () => items.filter((i) => i.status === 'confirmed' || i.status === 'in_preparation'),
    [items],
  );

  const titleSize = Math.max(11, Math.round(tileSize * 0.055));
  const textSize = Math.max(10, Math.round(tileSize * 0.045));

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg pt-safe pb-safe" style={{ fontSize: textSize }}>
      <Clock />

      {/* Barre du haut : boutique + retour */}
      <div className="flex items-center gap-2 px-3 py-2">
        <a href="/caisse" className="rounded-full border border-border bg-white px-3 py-1.5 text-xs text-ink-soft hover:text-ink">
          ‹ Caisse
        </a>
        <span className="font-semibold text-sm">Écran atelier</span>
        {stores.length > 1 && (
          <select
            className="input h-8 w-auto text-xs ml-1"
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              try { localStorage.setItem('webpos_atelier_store', e.target.value); } catch { /* ignore */ }
            }}
          >
            <option value="">Toutes les boutiques</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {message && (
          <span className="ml-2 rounded-lg bg-white border border-border px-2 py-1 text-xs">{message}</span>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-6 text-sm text-ink-soft">Chargement…</div>
      ) : (
        <div className="flex flex-col gap-4 px-2 pb-16">
          {/* Préparées */}
          <div className="flex flex-wrap gap-2">
            {ready.length === 0 ? (
              <div className="px-2 text-xs text-ink-soft/60">Aucune commande préparée.</div>
            ) : ready.map((item) => (
              <Tile key={`${item.source}-${item.id}`} item={item} width={tileSize}
                    titleSize={titleSize} textSize={textSize}
                    onClick={() => setDeliverItem(item)} />
            ))}
          </div>

          <div className="border-t border-border" />

          {/* À préparer */}
          <div className="flex flex-wrap gap-2">
            {toPrepare.length === 0 ? (
              <div className="px-2 text-xs text-ink-soft/60">Aucune commande à préparer.</div>
            ) : toPrepare.map((item) => (
              <Tile key={`${item.source}-${item.id}`} item={item} width={tileSize}
                    titleSize={titleSize} textSize={textSize}
                    onClick={() => setPrepareItem(item)} />
            ))}
          </div>
        </div>
      )}

      {/* Curseur taille tuiles */}
      <div className="fixed bottom-3 right-3 z-50 w-36 rounded-xl border border-border bg-white p-2 shadow-md">
        <input
          type="range" min={140} max={420} step={10} value={tileSize}
          onChange={(e) => {
            const v = Number(e.target.value);
            setTileSize(v);
            try { localStorage.setItem('webpos_atelier_tile', String(v)); } catch { /* ignore */ }
          }}
          className="w-full"
        />
      </div>

      {prepareItem && (
        <PrepareModal
          item={prepareItem}
          saving={saving}
          onClose={() => setPrepareItem(null)}
          onInProgress={async () => {
            if (await act(prepareItem, 'in_preparation')) setPrepareItem(null);
          }}
          onConfirm={async (numbers) => {
            if (numbers.some((n) => !n.prepared_number.trim())) {
              setMessage('Merci de saisir un numéro pour chaque composition.');
              return;
            }
            if (await act(prepareItem, 'ready', numbers)) setPrepareItem(null);
          }}
        />
      )}

      {deliverItem && (
        <ConfirmModal
          title={deliverItem.pickup_or_delivery === 'pickup' ? 'Marquer comme retirée ?' : 'Marquer comme livrée ?'}
          item={deliverItem}
          saving={saving}
          confirmLabel={deliverItem.pickup_or_delivery === 'pickup' ? 'Retirée' : 'Livrée'}
          onClose={() => setDeliverItem(null)}
          onConfirm={async () => {
            if (await act(deliverItem, 'delivered')) setDeliverItem(null);
          }}
        />
      )}
    </div>
  );
}

function Tile({ item, width, titleSize, textSize, onClick }: {
  item: AtelierItem; width: number; titleSize: number; textSize: number;
  onClick: () => void;
}) {
  const tone = tileTone(item);
  const unpaid = isUnpaid(item);
  const type = item.pickup_or_delivery === 'pickup' ? 'Retrait' : 'Livraison';
  const name = item.recipient_name || item.customer_name || 'Sans nom';
  const legend = unpaid && item.status !== 'ready' ? 'Non payée' : tone.legend;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex overflow-hidden rounded-xl text-left transition-transform active:scale-[0.98] ${tone.bg}`}
      style={{ width, minHeight: Math.max(100, Math.round(width * 0.55)) }}
    >
      {legend && (
        <div className={`flex w-[22px] shrink-0 items-center justify-center border-r border-black/10 bg-white/40 ${
          unpaid ? 'text-[#8F1F1F]' : tone.legendClass
        }`}>
          <span className="rotate-180 text-[9px] font-bold uppercase tracking-wider" style={{ writingMode: 'vertical-rl' }}>
            {legend}
          </span>
        </div>
      )}
      <div className="flex-1 min-w-0 p-2 text-center">
        <div className="font-semibold leading-tight" style={{ fontSize: titleSize }}>
          {type} — {name}
        </div>
        <div className="mt-1 text-ink-soft leading-tight" style={{ fontSize: textSize }}>
          {longDate(item.requested_at)}{item.slot_label ? ` · ${item.slot_label}` : ''}
          {item.store_name ? <div>{item.store_name}</div> : null}
        </div>
        {item.lines.length > 0 && (
          <div className="mt-1.5 border-t border-black/10 pt-1.5 space-y-0.5" style={{ fontSize: textSize }}>
            {item.lines.slice(0, 4).map((l) => (
              <div key={l.line_index} className="flex flex-wrap items-center justify-center gap-1">
                <span className="truncate">{l.quantity > 1 ? `${l.quantity} × ` : ''}{l.label}</span>
                {l.prepared_number ? (
                  <span className="rounded-full bg-[#B3D98C] px-1.5 text-[9px] font-semibold text-[#27500A]">
                    n° {l.prepared_number}
                  </span>
                ) : (
                  <span className="rounded-full bg-white/60 px-1.5 text-[9px] text-ink-soft">Sans n°</span>
                )}
              </div>
            ))}
          </div>
        )}
        {(item.card_message || item.internal_notes) && (
          <div className="mt-1.5 border-t border-black/10 pt-1.5 text-ink-soft leading-tight"
               style={{ fontSize: Math.max(9, textSize - 1) }}>
            {item.card_message ? `Carte : ${item.card_message}` : item.internal_notes}
          </div>
        )}
        {Number(item.total_amount) > 0 && (
          <div className="mt-1 font-medium" style={{ fontSize: textSize }}>
            {formatEUR(Number(item.total_amount))}
            {Number(item.deposit_amount) > 0 &&
              ` (acompte ${formatEUR(Number(item.deposit_amount))})`}
          </div>
        )}
      </div>
    </button>
  );
}

function PrepareModal({ item, saving, onClose, onInProgress, onConfirm }: {
  item: AtelierItem;
  saving: boolean;
  onClose: () => void;
  onInProgress: () => void;
  onConfirm: (numbers: { line_index: number; prepared_number: string }[]) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>(
    () => Object.fromEntries(item.lines.map((l) => [l.line_index, l.prepared_number ?? ''])),
  );

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto" onClick={onClose}>
      <div className="card w-full max-w-2xl lg:max-w-4xl p-6 my-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Préparer — {item.recipient_name || item.customer_name || 'Sans nom'}</h2>
        <p className="text-sm text-ink-soft mb-4">
          {longDate(item.requested_at)}{item.slot_label ? ` · ${item.slot_label}` : ''}
        </p>

        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {item.lines.length === 0 ? (
            <p className="text-sm text-ink-soft">Aucune ligne détaillée pour cette commande.</p>
          ) : item.lines.map((l) => (
            <div key={l.line_index} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-border p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {l.quantity > 1 ? `${l.quantity} × ` : ''}{l.label}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs text-ink-soft">Numéro</label>
                <input
                  className="input h-10 w-24 text-center"
                  placeholder="Ex : 12"
                  value={drafts[l.line_index] ?? ''}
                  onChange={(e) => setDrafts((cur) => ({ ...cur, [l.line_index]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>

        {item.card_message && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm">Carte : {item.card_message}</div>
        )}
        {item.internal_notes && (
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm">{item.internal_notes}</div>
        )}

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <button
            type="button" disabled={saving} onClick={onInProgress}
            className="rounded-xl border border-[#D6B72F] bg-[#FFF1A8] px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            En cours de préparation
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">Annuler</button>
            <button
              disabled={saving}
              onClick={() => onConfirm(
                item.lines.map((l) => ({ line_index: l.line_index, prepared_number: (drafts[l.line_index] ?? '').trim() })),
              )}
              className="btn-primary"
            >
              {saving ? 'Enregistrement…' : 'Préparée ✓'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ title, item, saving, confirmLabel, onClose, onConfirm }: {
  title: string; item: AtelierItem; saving: boolean; confirmLabel: string;
  onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p className="text-sm text-ink-soft mb-4">
          {item.pickup_or_delivery === 'pickup' ? 'Retrait' : 'Livraison'} — {item.recipient_name || item.customer_name || 'Sans nom'}<br />
          {longDate(item.requested_at)}{item.slot_label ? ` · ${item.slot_label}` : ''}
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button disabled={saving} onClick={onConfirm} className="btn-primary">
            {saving ? 'Enregistrement…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
