'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEUR } from '@/lib/services/money';

interface PaidOrder {
  id: string;
  number: string | null;
  total_amount: string;
  paid_at: string;
  customer_name: string | null;
  recipient_name: string | null;
  pickup_or_delivery: string;
}

interface ApiResp {
  orders: PaidOrder[];
  server_now?: string;
}

const STORAGE_KEY = 'florea_last_paid_check';
const SEEN_KEY = 'florea_seen_paid_orders';
const POLL_INTERVAL_MS = 8_000;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistSeen(s: Set<string>) {
  const arr = Array.from(s).slice(-200);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(arr)); } catch {}
}

export default function PaidOrderNotifier() {
  const [toasts, setToasts] = useState<PaidOrder[]>([]);
  const lastCheckRef = useRef<string>(
    typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) ?? new Date(Date.now() - 60_000).toISOString()
      : new Date().toISOString(),
  );
  const seenRef = useRef<Set<string>>(typeof window !== 'undefined' ? loadSeen() : new Set());

  useEffect(() => {
    let stopped = false;

    async function poll() {
      try {
        const r = await fetch(
          `/api/orders/recent-paid?since=${encodeURIComponent(lastCheckRef.current)}`,
          { cache: 'no-store' },
        );
        if (!r.ok) return;
        const j = (await r.json()) as ApiResp;
        if (stopped) return;

        const fresh = j.orders.filter((o) => !seenRef.current.has(o.id));
        if (fresh.length) {
          fresh.forEach((o) => seenRef.current.add(o.id));
          persistSeen(seenRef.current);
          setToasts((prev) => [...prev, ...fresh]);

          try {
            const audio = new Audio(
              'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
            );
            void audio.play().catch(() => {});
          } catch {}
        }

        if (j.server_now) {
          lastCheckRef.current = j.server_now;
          try { localStorage.setItem(STORAGE_KEY, j.server_now); } catch {}
        }
      } catch {
        // réseau coupé ou autre : on retentera
      }
    }

    void poll();
    const id = window.setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), 15_000),
    );
    return () => { timers.forEach(clearTimeout); };
  }, [toasts]);

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((o) => {
        const who = o.recipient_name ?? o.customer_name ?? 'Client';
        const label = o.pickup_or_delivery === 'delivery' ? 'Livraison' : 'Retrait';
        return (
          <div
            key={o.id}
            className="pointer-events-auto rounded-2xl bg-success text-white shadow-lg p-4 animate-slide-in"
            role="alert"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">💳</div>
              <div className="flex-1">
                <div className="text-xs font-semibold uppercase tracking-wide opacity-90">
                  Paiement reçu · {label}
                </div>
                <div className="mt-0.5 text-base font-bold">
                  {o.number ? `#${o.number}` : 'Commande'} — {who}
                </div>
                <div className="mt-1 text-lg font-extrabold">
                  {formatEUR(Number(o.total_amount))}
                </div>
              </div>
              <button
                onClick={() => dismiss(o.id)}
                className="text-white/80 hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
