'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEUR, round2 } from '@/lib/services/money';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { useRouter } from 'next/navigation';
import { promptThemed } from '@/lib/ui/dialog';

interface GiftCard {
  id: string; code: string;
  initial_amount: string; balance: string;
  status: string;
  /** 'gift_card' (carte cadeau) ou 'voucher' (bon d'achat). Défaut carte cadeau. */
  kind?: string | null;
  issued_at: string; expires_at: string | null;
  buyer_name: string | null; buyer_phone: string | null;
  buyer_email: string | null;
  beneficiary_id?: string | null;
  beneficiary_name?: string | null;
  beneficiary_phone?: string | null;
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
  const [q, setQ] = useState('');
  const router = useRouter();

  // Vendre une carte cadeau / un bon d'achat : on prépare l'article puis on
  // ouvre la caisse avec dans le panier (encaissement classique). L'article en
  // attente est transmis via localStorage et consommé au montage de la caisse.
  async function sellGiftCard() {
    const raw = await promptThemed({
      title: 'Nouvelle carte cadeau', message: 'Montant de la carte cadeau (€)',
      placeholder: 'ex : 50', confirmLabel: 'Envoyer au panier',
    });
    if (raw == null) return;
    const amount = round2(Number(raw.replace(',', '.').trim()));
    if (!Number.isFinite(amount) || amount <= 0) return;
    try { localStorage.setItem('webpos_pending_cart_item', JSON.stringify({ kind: 'gift_card', amount })); } catch { /* quota */ }
    router.push('/caisse');
  }
  async function sellVoucher() {
    const rawFace = await promptThemed({
      title: 'Nouveau bon d’achat', message: 'Valeur du bon d’achat (€)',
      placeholder: 'ex : 20', confirmLabel: 'Continuer',
    });
    if (rawFace == null) return;
    const face = round2(Number(rawFace.replace(',', '.').trim()));
    if (!Number.isFinite(face) || face <= 0) return;
    const rawPaid = await promptThemed({
      title: 'Bon d’achat — montant payé',
      message: 'Montant payé par le client (€) — 0 = offert, laisser vide = plein tarif',
      defaultValue: String(face), confirmLabel: 'Envoyer au panier',
    });
    if (rawPaid == null) return;
    const paidParsed = rawPaid.trim() === '' ? face : round2(Number(rawPaid.replace(',', '.').trim()));
    const paid = Number.isFinite(paidParsed) ? Math.max(0, Math.min(face, paidParsed)) : face;
    try { localStorage.setItem('webpos_pending_cart_item', JSON.stringify({ kind: 'voucher', amount: face, paid })); } catch { /* quota */ }
    router.push('/caisse');
  }

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
      c.buyer_email?.toLowerCase().includes(needle) ||
      c.beneficiary_name?.toLowerCase().includes(needle) ||
      c.beneficiary_phone?.includes(needle),
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
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Cartes cadeaux"
        subtitle="Émettez et suivez vos cartes cadeaux. Chaque carte porte un code-barre EAN-13 scannable en caisse."
        actions={(
          <div className="flex items-center gap-2">
            <button className="btn-soft" onClick={() => void sellVoucher()}>
              + Nouveau bon d’achat
            </button>
            <button className="btn-primary" onClick={() => void sellGiftCard()}>
              + Nouvelle carte cadeau
            </button>
          </div>
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
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Bénéficiaire</th>
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
                const benefName = c.beneficiary_name ?? c.buyer_name ?? null;
                const benefPhone = c.beneficiary_phone ?? c.buyer_phone ?? null;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-4 py-3">
                      {c.kind === 'voucher'
                        ? <Badge tone="warning">Bon d&apos;achat</Badge>
                        : <Badge tone="soft">Carte cadeau</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">{benefName ?? '—'}</div>
                      {benefPhone && (
                        <div className="text-xs text-ink-soft">{benefPhone}</div>
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
