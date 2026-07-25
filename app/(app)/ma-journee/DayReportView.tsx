'use client';

import type { DayReport } from '@/lib/services/day-report';

const eur = (n: number) =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const rate = (r: number) =>
  `${r.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR') : '—');

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte bancaire', check: 'Chèque', transfer: 'Virement',
  gift_card: 'Carte cadeau', credit_note: 'Avoir', deferred: 'Mise en compte',
  payment_link: 'Lien de paiement', other: 'Autre',
};

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 py-0.5 text-sm ${bold ? 'font-semibold' : ''}`}>
      <span className="text-ink-soft">{label}</span>
      <span className="tabular-nums text-right">{value}</span>
    </div>
  );
}
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 mt-3 border-t border-border first:border-t-0 first:mt-0 first:pt-0">
      {title && <div className="text-[10px] uppercase tracking-widest text-ink-soft font-semibold mb-1">{title}</div>}
      {children}
    </div>
  );
}

export default function DayReportView({ report: r }: { report: DayReport }) {
  const id = r.identity;
  return (
    <div className="text-sm">
      <div className="text-center pb-2">
        <div className="font-semibold">{id.name || r.store_name}</div>
        {id.line1 && <div className="text-xs text-ink-soft">{id.line1}</div>}
        <div className="text-xs text-ink-soft">{[id.zip, id.city].filter(Boolean).join(' ')}</div>
        {id.siret && <div className="text-[10px] text-ink-soft">Siret : {id.siret}</div>}
        {id.vat_number && <div className="text-[10px] text-ink-soft">TVA : {id.vat_number}</div>}
        <div className="mt-2 text-2xl font-bold tracking-tight">{r.kind}</div>
      </div>

      <Section>
        <Row label="Numéro de journée" value={r.journee_number != null ? String(r.journee_number) : '—'} />
        <Row label="Ouverture" value={dt(r.opened_at)} />
        <Row label="Fermeture" value={r.kind === 'X' ? 'En cours' : dt(r.closed_at)} />
        <Row label="Date impression" value={dt(r.printed_at)} />
      </Section>

      <Section>
        <Row label="CA TOTAL" value={eur(r.totals.ca_ttc)} bold />
        <Row label="CA HT" value={eur(r.totals.ca_ht)} />
        <Row label="Ticket moyen TTC" value={eur(r.totals.ticket_moyen_ttc)} />
        {r.totals.marge_brute_ht != null && <Row label="Marge brute HT" value={eur(r.totals.marge_brute_ht)} />}
      </Section>

      {r.tva_by_rate.length > 0 && (
        <Section>
          {r.tva_by_rate.map((t) => <Row key={`c${t.rate}`} label={`TVA ${rate(t.rate)} collectée`} value={eur(t.tva)} />)}
          <div className="h-1" />
          {r.tva_by_rate.map((t) => <Row key={`t${t.rate}`} label={`CA TTC ${rate(t.rate)}`} value={eur(t.ttc)} />)}
          <div className="h-1" />
          {r.tva_by_rate.map((t) => <Row key={`h${t.rate}`} label={`CA HT ${rate(t.rate)}`} value={eur(t.ht)} />)}
        </Section>
      )}

      <Section>
        <Row label="Total réduction" value={`-${eur(r.totals.discounts_total)}`} />
        <Row label="Total offerts" value={eur(r.totals.offerts_total)} />
        <Row label="Nombre d'offerts" value={String(r.totals.offerts_count)} />
      </Section>

      <Section title="Modes de règlement">
        {r.payments.length === 0
          ? <Row label="—" value={eur(0)} />
          : r.payments.map((p) => (
              <Row key={p.method} label={`${PAYMENT_LABELS[p.method] ?? p.method} [${p.count}]`} value={eur(p.amount)} />
            ))}
      </Section>

      <Section title="Entrées d'argent">
        {r.cash.entrees_argent > 0 && <Row label="Entrées d'argent" value={eur(r.cash.entrees_argent)} />}
        <Row label="Fonds de caisse" value={eur(r.cash.fonds_de_caisse)} />
        {r.cash.remise_banque > 0 && <Row label="Remise en banque" value={`-${eur(r.cash.remise_banque)}`} />}
        <Row label="Total espèce caisse à la fermeture" value={eur(r.cash.total_espece_fermeture)} />
        {r.cash.counted != null && <Row label="Espèces comptées" value={eur(r.cash.counted)} />}
        <Row label="Ouverture tiroir caisse sans ticket" value={String(r.cash.tiroir_sans_ticket)} />
      </Section>

      {r.by_vendor.length > 0 && (
        <Section title="Données par vendeur">
          {r.by_vendor.map((v) => <Row key={v.name} label={`${v.name} — CA TTC`} value={eur(v.ca_ttc)} />)}
        </Section>
      )}

      {r.by_category.length > 0 && (
        <Section title="CA TTC Familles">
          {r.by_category.map((c) => <Row key={c.name} label={c.name} value={eur(c.ca_ttc)} />)}
        </Section>
      )}

      {r.by_mode.length > 0 && (
        <Section title="CA TTC Modes de ventes">
          {r.by_mode.map((m) => <Row key={m.mode} label={m.mode} value={eur(m.ca_ttc)} />)}
        </Section>
      )}

      <Section title="Nombre de tickets">
        <Row label="Nombre de tickets normal" value={String(r.tickets.normal_count)} />
        <Row label="Total ticket NORMAL" value={eur(r.tickets.normal_total)} />
      </Section>
    </div>
  );
}
