import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import Tabs from '@/components/Tabs';

export const dynamic = 'force-dynamic';

export default async function CompanySettingsPage() {
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
  const stores = await query<{ id: string; code: string; name: string; address: { line1?: string; zip?: string; city?: string } | null }>(
    `SELECT id, code, name, address FROM stores
      WHERE organization_id = $1 AND is_active ORDER BY name`,
    [user.organizationId],
  );
  const registers = await query<{ id: string; code: string; name: string; store_id: string; store_name: string }>(
    `SELECT r.id, r.code, r.name, r.store_id, s.name AS store_name FROM registers r
       JOIN stores s ON s.id = r.store_id
      WHERE r.organization_id = $1 AND r.is_active ORDER BY s.name, r.name`,
    [user.organizationId],
  );
  const tax = await query<{ code: string; label: string; rate: string; is_default: boolean }>(
    `SELECT code, label, rate, is_default FROM tax_rates
      WHERE organization_id = $1 AND is_active ORDER BY rate DESC`,
    [user.organizationId],
  );
  const o = org.rows[0]!;

  return (
    <div className="p-8 space-y-5 max-w-5xl">
      <Link href="/settings" className="text-sm text-ink-soft hover:text-ink">← Paramètres</Link>
      <PageHeader title="Société & boutiques" subtitle="Identité légale, boutiques, caisses et taux de TVA." />

      <Tabs tabs={[
        {
          key: 'company',
          label: 'Identité',
          content: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="card p-5">
                <h3 className="font-semibold mb-3">Identité légale</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Item label="Nom commercial" value={o.name} />
                  <Item label="Raison sociale" value={o.legal_name} />
                  <Item label="SIRET" value={o.siret ?? '—'} />
                  <Item label="N° TVA intra." value={o.vat_number ?? '—'} />
                </dl>
              </div>
              <div className="card p-5">
                <h3 className="font-semibold mb-3">Coordonnées</h3>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Item label="Adresse" full value={[o.address?.line1, o.address?.zip, o.address?.city].filter(Boolean).join(' ') || '—'} />
                  <Item label="Téléphone" value={o.contact?.phone ?? '—'} />
                  <Item label="Email" value={o.contact?.email ?? '—'} />
                </dl>
              </div>
            </div>
          ),
        },
        {
          key: 'stores',
          label: `Boutiques (${stores.rowCount})`,
          content: (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stores.rows.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{s.name}</span>
                    <Badge tone="neutral">{s.code}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-ink-soft">
                    {[s.address?.line1, s.address?.zip, s.address?.city].filter(Boolean).join(' ') || '—'}
                  </div>
                </div>
              ))}
            </div>
          ),
        },
        {
          key: 'registers',
          label: `Caisses (${registers.rowCount})`,
          content: (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white text-ink-soft text-xs uppercase border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3">Code</th>
                    <th className="text-left px-4 py-3">Nom</th>
                    <th className="text-left px-4 py-3">Boutique</th>
                  </tr>
                </thead>
                <tbody>
                  {registers.rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-ink-soft">{r.store_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          key: 'tax',
          label: 'Taux de TVA',
          content: (
            <div className="card p-5">
              <table className="w-full text-sm">
                <thead className="text-ink-soft text-xs uppercase">
                  <tr>
                    <th className="text-left py-2">Code</th>
                    <th className="text-left py-2">Libellé</th>
                    <th className="text-right py-2">Taux</th>
                    <th className="text-center py-2">Défaut</th>
                  </tr>
                </thead>
                <tbody>
                  {tax.rows.map((t) => (
                    <tr key={t.code} className="border-t border-border">
                      <td className="py-2 font-mono text-xs">{t.code}</td>
                      <td className="py-2">{t.label}</td>
                      <td className="py-2 text-right font-medium">{t.rate}%</td>
                      <td className="py-2 text-center">
                        {t.is_default ? <Badge tone="success">Oui</Badge> : <span className="text-ink-soft">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

function Item({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
