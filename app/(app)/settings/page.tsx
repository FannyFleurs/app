import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = (await readSessionFromCookie())!;
  const org = await query<{
    name: string; legal_name: string; siret: string | null; vat_number: string | null;
    address: { line1?: string; zip?: string; city?: string; country?: string } | null;
    contact: { phone?: string; email?: string } | null;
  }>(
    `SELECT name, legal_name, siret, vat_number, address, contact
       FROM organizations WHERE id = $1`,
    [user.organizationId],
  );
  const stores = await query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM stores WHERE organization_id = $1 ORDER BY name`,
    [user.organizationId],
  );
  const registers = await query<{ id: string; code: string; name: string; store_id: string }>(
    `SELECT id, code, name, store_id FROM registers WHERE organization_id = $1 ORDER BY name`,
    [user.organizationId],
  );
  const tax = await query<{ code: string; label: string; rate: string; is_default: boolean }>(
    `SELECT code, label, rate, is_default FROM tax_rates WHERE organization_id = $1 ORDER BY rate DESC`,
    [user.organizationId],
  );
  const o = org.rows[0]!;
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
      <section className="card p-5">
        <h2 className="font-semibold">Société</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Item label="Nom commercial" value={o.name} />
          <Item label="Raison sociale" value={o.legal_name} />
          <Item label="SIRET" value={o.siret ?? '—'} />
          <Item label="N° TVA intra." value={o.vat_number ?? '—'} />
          <Item label="Adresse" value={[o.address?.line1, o.address?.zip, o.address?.city].filter(Boolean).join(' ') || '—'} />
          <Item label="Téléphone" value={o.contact?.phone ?? '—'} />
        </dl>
        <p className="mt-4 text-xs text-ink-soft">
          L&apos;édition des paramètres société sera disponible dans une phase ultérieure
          (Phase 4 — paramétrage avancé).
        </p>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Boutiques</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {stores.rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span className="chip">{s.code}</span>{s.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Caisses</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {registers.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3">
              <span className="chip">{r.code}</span>{r.name}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Taux de TVA</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {tax.rows.map((t) => (
            <li key={t.code}>
              <span className="chip">{t.code}</span> <span className="ml-2">{t.label} — {t.rate}%</span>
              {t.is_default && <span className="ml-2 text-xs text-sage-deep">(par défaut)</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
