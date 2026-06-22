'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';

interface GiftCard {
  id: string; code: string;
  initial_amount: string; balance: string;
  status: string;
  issued_at: string; expires_at: string | null;
  buyer_name: string | null; buyer_phone: string | null;
  buyer_email: string | null; message: string | null;
}

const STATUS: Record<string, { label: string; tone: 'success' | 'soft' | 'warning' | 'neutral' | 'danger' }> = {
  active: { label: 'Active', tone: 'success' },
  partially_used: { label: 'Partiellement utilisée', tone: 'soft' },
  used: { label: 'Utilisée', tone: 'neutral' },
  expired: { label: 'Expirée', tone: 'warning' },
  cancelled: { label: 'Annulée', tone: 'danger' },
};

export default function GiftCardsAdmin() {
  const [items, setItems] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState('');

  async function reload() {
    setLoading(true);
    const r = await fetch('/api/gift-cards');
    if (r.ok) setItems((await r.json()).gift_cards);
    setLoading(false);
  }
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((c) =>
      c.code.includes(needle) ||
      c.buyer_name?.toLowerCase().includes(needle) ||
      c.buyer_phone?.includes(needle) ||
      c.buyer_email?.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const totals = useMemo(() => ({
    count: items.length,
    active: items.filter((c) => c.status === 'active' || c.status === 'partially_used').length,
    outstanding: items
      .filter((c) => c.status === 'active' || c.status === 'partially_used')
      .reduce((s, c) => s + Number(c.balance), 0),
    issued: items.reduce((s, c) => s + Number(c.initial_amount), 0),
  }), [items]);

  return (
    <div className="p-8 space-y-5">
      <PageHeader
        title="Cartes cadeaux"
        subtitle="Émettez et suivez vos cartes cadeaux. Chaque carte porte un code-barre EAN-13 scannable en caisse."
        actions={(
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Nouvelle carte cadeau
          </button>
        )}
      />

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total émis" value={String(totals.count)} />
        <Kpi label="Actives" value={String(totals.active)} />
        <Kpi label="Solde en circulation" value={formatEUR(totals.outstanding)} />
        <Kpi label="Montant total émis" value={formatEUR(totals.issued)} />
      </section>

      <div className="card p-3">
        <input
          className="input max-w-md"
          placeholder="Rechercher par code, nom, téléphone, email…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-sm text-ink-soft">Chargement…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="✦"
          title="Aucune carte cadeau"
          description="Créez votre première carte cadeau avec le bouton en haut à droite."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
              <tr>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Acheteur</th>
                <th className="text-right px-4 py-3">Initial</th>
                <th className="text-right px-4 py-3">Solde</th>
                <th className="text-center px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Émise le</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const s = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const };
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{c.buyer_name ?? '—'}</div>
                      {(c.buyer_phone || c.buyer_email) && (
                        <div className="text-xs text-ink-soft">
                          {[c.buyer_phone, c.buyer_email].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatEUR(Number(c.initial_amount))}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatEUR(Number(c.balance))}</td>
                    <td className="px-4 py-3 text-center"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="px-4 py-3 text-ink-soft text-xs">
                      {new Date(c.issued_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a href={`/api/gift-cards/${c.id}/pdf`} target="_blank" rel="noreferrer"
                         className="text-accent-deep text-xs hover:underline">
                        PDF →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateGiftCardModal
          onClose={() => setShowCreate(false)}
          onCreated={(_id, code) => {
            setShowCreate(false);
            void reload();
            // ouvre directement le PDF
            window.open(`/api/gift-cards/${_id}/pdf`, '_blank');
            void code;
          }}
        />
      )}
    </div>
  );
}

function CreateGiftCardModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (id: string, code: string) => void;
}) {
  const [amount, setAmount] = useState<number>(50);
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [message, setMessage] = useState('');
  const [expires, setExpires] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (amount <= 0) { setError('Montant invalide'); return; }
    setSaving(true); setError(null);
    const r = await fetch('/api/gift-cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        buyer_name: buyerName.trim() || undefined,
        buyer_phone: buyerPhone.trim() || undefined,
        buyer_email: buyerEmail.trim() || undefined,
        message: message.trim() || undefined,
        expires_at: expires || undefined,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? j.error ?? 'Erreur');
      return;
    }
    const j = await r.json();
    onCreated(j.id, j.code);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 backdrop-blur-sm p-4 overflow-auto">
      <div className="card max-w-md w-full p-6 my-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Nouvelle carte cadeau</h2>
          <button onClick={onClose} className="text-ink-soft hover:text-ink">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-ink-soft">Montant (€)</label>
            <input type="number" step="0.5" min={1} className="input mt-1 text-xl font-semibold"
                   value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium text-ink-soft">Nom acheteur</label>
              <input className="input mt-1" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-ink-soft">Téléphone</label>
              <input className="input mt-1" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Email</label>
            <input type="email" className="input mt-1" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Message (carte cadeau)</label>
            <textarea className="input mt-1 h-16" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-ink-soft">Date d&apos;expiration (optionnel)</label>
            <input type="date" className="input mt-1" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>

        {error && <div className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={() => void submit()} disabled={saving || amount <= 0} className="btn-primary">
            {saving ? 'Création…' : `Créer et imprimer (${formatEUR(amount)})`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
