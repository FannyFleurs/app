'use client';

import { useEffect, useState } from 'react';

interface Health {
  connection: { host_masked: string; pooled: boolean; ssl: boolean };
  region?: {
    expected: string;
    expected_city: string;
    function: string | null;
    function_city: string | null;
    function_cloud: string | null;
    database: string | null;
    database_city: string | null;
    colocated: boolean | null;
    matches_config: boolean | null;
  };
  latency?: { min_ms: number; median_ms: number; samples: number[] } | null;
  rls?: { enforced: boolean; tables: number };
  postgres_version: string | null;
  db_bytes: number;
  db_pretty: string;
  avg_ticket_bytes: number;
  counts: Record<string, number>;
  top_tables: Array<{ name: string; bytes: number; pretty: string }>;
}

// Paliers de stockage courants (Postgres managé) pour situer la base.
const TIERS = [
  { label: 'Gratuit (~0,5 Go)', bytes: 0.5 * 1024 ** 3 },
  { label: 'Payant (~10 Go)', bytes: 10 * 1024 ** 3 },
  { label: 'Payant (~50 Go)', bytes: 50 * 1024 ** 3 },
];

const COUNT_LABELS: Record<string, string> = {
  organizations: 'Organisations',
  stores: 'Boutiques',
  users: 'Utilisateurs',
  customers: 'Clients',
  products: 'Produits',
  tickets: 'Tickets validés',
  receipts: 'Reçus',
  invoices: 'Factures',
};

export default function HealthView() {
  const [data, setData] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/admin/health', { cache: 'no-store' });
      if (!r.ok) { setError('Chargement impossible.'); return; }
      setData(await r.json());
    } catch {
      setError('Réseau indisponible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <div className="p-8 text-sm text-ink-soft">Chargement…</div>;
  if (error || !data) return <div className="p-8 text-sm text-danger">{error ?? 'Erreur.'}</div>;

  const tickets = data.counts.tickets || 0;
  // Poids RÉEL d'un ticket (mesuré serveur), et non la base entière divisée
  // par le nb de tickets — la base contient une grosse part fixe (catalogue,
  // config, système) qui ne grossit PAS avec les ventes.
  const perTicket = data.avg_ticket_bytes || 4096;

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Santé &amp; quota</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Volumétrie de la base et vérifications d&apos;infrastructure.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-ghost text-sm">Rafraîchir</button>
      </div>

      {/* Région d'exécution & latence */}
      <RegionCard region={data.region} latency={data.latency} />

      {/* Chronométrage des requêtes réelles */}
      <ProbesCard />

      {/* Connexion / infra */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Connexion base de données</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <Check
            ok={data.connection.pooled}
            title="Pooler (PgBouncer)"
            good="Activé — OK pour le serverless"
            bad="ABSENT — risque de saturation des connexions"
          />
          <Check
            ok={data.connection.ssl}
            title="SSL"
            good="Chiffré (sslmode=require)"
            bad="Non forcé dans l'URL"
          />
          <div className="rounded-xl border border-border p-3">
            <div className="text-xs text-ink-soft">Serveur</div>
            <div className="font-medium truncate">{data.connection.host_masked || '—'}</div>
            <div className="text-xs text-ink-soft mt-0.5">PostgreSQL {data.postgres_version ?? '?'}</div>
          </div>
          {data.rls && (
            <div className={`rounded-xl border p-3 ${data.rls.enforced ? 'border-success/40 bg-success/5' : 'border-border'}`}>
              <div className="text-xs text-ink-soft flex items-center gap-1.5">
                <span className={data.rls.enforced ? 'text-success' : 'text-ink-soft'}>{data.rls.enforced ? '✓' : '○'}</span>
                Isolation RLS ({data.rls.tables} tables)
              </div>
              <div className={`text-sm font-medium mt-0.5 ${data.rls.enforced ? 'text-success' : 'text-ink'}`}>
                {data.rls.enforced
                  ? 'Active — cloisonnement strict par boutique'
                  : 'Prête (définir RLS_ENFORCE=1 pour forcer)'}
              </div>
            </div>
          )}
        </div>
        {!data.connection.pooled && (
          <p className="mt-3 text-xs text-danger">
            ⚠ La connexion ne semble pas passer par le pooler. En serverless,
            utilisez l&apos;URL <code>…-pooler…</code> (Neon) / PgBouncer pour
            éviter l&apos;épuisement des connexions.
          </p>
        )}
      </div>

      {/* Taille de la base + projection */}
      <div className="card p-5">
        <h2 className="font-semibold mb-1">Stockage</h2>
        <div className="text-4xl font-semibold tracking-tight tabular-nums">{data.db_pretty}</div>
        <p className="mt-1 text-sm text-ink-soft">
          {tickets.toLocaleString('fr-FR')} tickets validés
          {' · '}~{Math.max(1, Math.round(perTicket / 1024))} Ko / ticket (poids réel)
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          La taille actuelle est surtout du <strong>fixe</strong> (catalogue,
          config, système) : elle ne grossit quasiment pas avec les ventes.
          Les projections ci-dessous n&apos;ajoutent que le poids réel des
          nouveaux tickets.
        </p>

        <div className="mt-4 space-y-3">
          {TIERS.map((t) => {
            const pct = Math.min(100, (data.db_bytes / t.bytes) * 100);
            const remainingTickets = perTicket > 0 ? Math.max(0, Math.floor((t.bytes - data.db_bytes) / perTicket)) : null;
            return (
              <div key={t.label}>
                <div className="flex items-baseline justify-between text-xs text-ink-soft">
                  <span>{t.label}</span>
                  <span className="tabular-nums">
                    {pct.toFixed(pct < 1 ? 2 : 1)} %
                    {remainingTickets != null && ` · ~${remainingTickets.toLocaleString('fr-FR')} tickets restants`}
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warning' : ''}`}
                    style={{ width: `${Math.max(1, pct)}%`, backgroundColor: pct > 60 ? undefined : 'var(--primary)' }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Repère indicatif : les paliers dépendent de votre offre PostgreSQL réelle.
        </p>
      </div>

      {/* Volumétrie métier */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Volumétrie</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(data.counts).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-3">
              <div className="text-xs text-ink-soft">{COUNT_LABELS[k] ?? k}</div>
              <div className="text-xl font-semibold tabular-nums">{v.toLocaleString('fr-FR')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plus grosses tables */}
      <div className="card p-5">
        <h2 className="font-semibold mb-3">Plus grosses tables</h2>
        <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
          {data.top_tables.map((t) => {
            const pct = data.db_bytes > 0 ? (t.bytes / data.db_bytes) * 100 : 0;
            return (
              <div key={t.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-mono text-xs text-ink-soft w-40 truncate">{t.name}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(1, pct)}%`, backgroundColor: 'var(--primary)' }} />
                </div>
                <span className="tabular-nums text-ink-soft w-20 text-right">{t.pretty}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface Probes {
  probes: Array<{
    key: string; label: string; hint: string; warn: number;
    ms: number | null; rows: number | null; ok: boolean;
  }>;
  total_ms: number;
  auth_ms: number;
  handler_ms: number;
  org: {
    id: string; name: string; products: number;
    list: Array<{ id: string; name: string; products: number }>;
  };
  instance: { cold_start: boolean; age_s: number; served: number };
}

/**
 * Chronomètre les requêtes réellement jouées par la caisse, côté serveur.
 * Permet de trancher entre « c'est le réseau », « c'est une requête SQL »
 * et « c'est un démarrage à froid ».
 */
function ProbesCard() {
  const [data, setData] = useState<Probes | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(false);
  // Temps total vu par le navigateur : inclut le trajet réseau, contrairement
  // au temps serveur. L'écart entre les deux EST le coût réseau.
  const [roundTrip, setRoundTrip] = useState<number | null>(null);
  // Organisation ciblée : mesurer sur une org vide ne veut rien dire, on doit
  // pouvoir viser celle qui contient réellement le catalogue.
  const [orgId, setOrgId] = useState<string>('');

  async function measure(org?: string) {
    setBusy(true); setErr(false);
    const t0 = performance.now();
    try {
      const qs = org ? `?org=${encodeURIComponent(org)}` : '';
      const r = await fetch(`/api/admin/health/probes${qs}`, { cache: 'no-store' });
      if (!r.ok) { setErr(true); return; }
      const j: Probes = await r.json();
      setData(j);
      setOrgId(j.org.id);
      setRoundTrip(Math.round(performance.now() - t0));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { void measure(); }, []);

  // Le temps serveur à soustraire est celui du handler COMPLET (auth incluse),
  // sinon le coût de l'authentification est compté à tort comme du réseau.
  const network = data && roundTrip != null ? Math.max(0, Math.round(roundTrip - data.handler_ms)) : null;
  const slowest = data ? Math.max(...data.probes.map((p) => p.ms ?? 0), 1) : 1;

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-semibold">Temps des requêtes de la caisse</h2>
          <p className="text-xs text-ink-soft mt-0.5">
            Temps d&apos;exécution mesuré côté serveur, sur les requêtes réellement
            jouées par l&apos;application. Lecture seule.
          </p>
        </div>
        <button onClick={() => void measure(orgId || undefined)} disabled={busy} className="btn-ghost text-sm shrink-0">
          {busy ? 'Mesure…' : 'Mesurer'}
        </button>
      </div>

      {data && data.org.list.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="probe-org" className="text-xs text-ink-soft">Mesurer sur</label>
          <select
            id="probe-org"
            className="input text-sm py-1.5 w-auto"
            value={orgId}
            disabled={busy}
            onChange={(e) => { setOrgId(e.target.value); void measure(e.target.value); }}
          >
            {data.org.list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {o.products.toLocaleString('fr-FR')} article{o.products > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          {data.org.products === 0 && (
            <span className="text-xs text-warning">
              ⚠ Organisation sans article : les temps ci-dessous ne sont pas représentatifs.
            </span>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-danger">Mesure impossible.</p>}
      {busy && !data && <p className="mt-3 text-sm text-ink-soft">Mesure en cours…</p>}

      {data && (
        <>
          <div className="mt-4 space-y-2.5">
            {data.probes.map((p) => {
              const ms = p.ms;
              const tone =
                !p.ok || ms == null ? { bar: 'var(--primary)', text: 'text-ink-soft' }
                : ms <= p.warn        ? { bar: '#2F6B3F', text: 'text-success' }
                : ms <= p.warn * 2.5  ? { bar: '#B7791F', text: 'text-warning' }
                :                       { bar: '#B42318', text: 'text-danger' };
              return (
                <div key={p.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className={`tabular-nums font-semibold shrink-0 ${tone.text}`}>
                      {p.ok && ms != null ? `${ms} ms` : 'n/a'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, ((ms ?? 0) / slowest) * 100)}%`, backgroundColor: tone.bar }}
                    />
                  </div>
                  <div className="mt-0.5 text-xs text-ink-soft">
                    {p.hint}
                    {/* Toujours afficher le volume : « 0 ligne » signale une
                        mesure non représentative (organisation vide). */}
                    {p.rows != null && ` · ${p.rows.toLocaleString('fr-FR')} ligne${p.rows > 1 ? 's' : ''} lue${p.rows > 1 ? 's' : ''}`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Répartition serveur / réseau */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-ink-soft">Requêtes SQL</div>
              <div className="text-xl font-semibold tabular-nums">{data.total_ms} ms</div>
              <div className="text-xs text-ink-soft mt-0.5">les 6 sondes</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-ink-soft">Authentification</div>
              <div className="text-xl font-semibold tabular-nums">{data.auth_ms} ms</div>
              <div className="text-xs text-ink-soft mt-0.5">payée à chaque appel</div>
            </div>
            <div className="rounded-xl border border-border p-3">
              <div className="text-xs text-ink-soft">Réseau</div>
              <div className="text-xl font-semibold tabular-nums">{network == null ? '—' : `${network} ms`}</div>
              <div className="text-xs text-ink-soft mt-0.5">Trajet appareil ⇄ Francfort</div>
            </div>
            <div
              className={`rounded-xl border p-3 ${
                data.instance.cold_start ? 'border-warning/40 bg-warning/5' : 'border-border'
              }`}
            >
              <div className="text-xs text-ink-soft">Instance serveur</div>
              <div className="text-xl font-semibold tabular-nums">
                {data.instance.cold_start ? 'À froid' : 'À chaud'}
              </div>
              <div className="text-xs text-ink-soft mt-0.5">
                démarrée il y a {formatAge(data.instance.age_s)}
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-soft">
            Lecture : si les <strong>requêtes SQL</strong> sont rapides et le{' '}
            <strong>réseau</strong> élevé, la lenteur vient de la liaison entre
            l&apos;appareil et Francfort, pas de la base — le levier est alors de
            réduire le nombre d&apos;appels, pas de les accélérer. Si une ligne
            ressort en rouge, c&apos;est cette requête qu&apos;il faut optimiser.
            Relance plusieurs fois : si l&apos;instance repart « à froid » à
            chaque fois, ce sont les démarrages de fonctions qui coûtent.
          </p>
        </>
      )}
    </div>
  );
}

function formatAge(s: number): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/**
 * Région réelle de la fonction vs région de la base, et latence mesurée.
 * Sert à détecter le cas coûteux : fonctions déployées aux US (iad1) alors
 * que la base est à Francfort → chaque requête traverse l'Atlantique.
 */
function RegionCard({ region, latency }: { region: Health['region']; latency: Health['latency'] }) {
  if (!region) return null;

  const local = !region.function; // hors Vercel (dev local)
  const bad = region.colocated === false;
  const good = region.colocated === true;

  // Paliers indicatifs pour un aller-retour SQL trivial (SELECT 1).
  const ms = latency?.median_ms ?? null;
  // Classes écrites en entier : Tailwind ne génère pas les classes construites
  // dynamiquement (`text-${x}`) — elles seraient absentes du CSS final.
  const lat =
    ms == null  ? { box: 'border-border',                 text: 'text-ink-soft', label: '—' }
    : ms < 15   ? { box: 'border-success/40 bg-success/5', text: 'text-success',  label: 'Excellent' }
    : ms < 40   ? { box: 'border-warning/40 bg-warning/5', text: 'text-warning',  label: 'Correct' }
    :             { box: 'border-danger/40 bg-danger/5',   text: 'text-danger',   label: 'Lent — régions probablement éloignées' };

  return (
    <div className="card p-5">
      <h2 className="font-semibold mb-3">Région d&apos;exécution &amp; latence</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border border-border p-3">
          <div className="text-xs text-ink-soft">Fonctions (Vercel)</div>
          <div className="font-medium">
            {local ? 'Local (hors Vercel)' : `${region.function_city ?? '?'} (${region.function})`}
          </div>
          <div className="text-xs text-ink-soft mt-0.5">
            Attendu : {region.expected_city} ({region.expected})
          </div>
        </div>

        <div className="rounded-xl border border-border p-3">
          <div className="text-xs text-ink-soft">Base de données</div>
          <div className="font-medium">{region.database_city ?? 'Indéterminée'}</div>
          <div className="text-xs text-ink-soft mt-0.5">{region.database ?? '—'}</div>
        </div>

        <div className={`rounded-xl border p-3 ${lat.box}`}>
          <div className="text-xs text-ink-soft">Latence base (aller-retour)</div>
          <div className="text-xl font-semibold tabular-nums">
            {ms == null ? '—' : `${ms} ms`}
            {latency && <span className="text-xs font-normal text-ink-soft ml-1.5">min {latency.min_ms} ms</span>}
          </div>
          <div className={`text-xs mt-0.5 ${lat.text}`}>{lat.label}</div>
        </div>
      </div>

      {/* Verdict */}
      {good && (
        <p className="mt-3 text-sm text-success">
          ✓ Fonctions et base co-localisées ({region.function_city}) — latence minimale, rien à changer.
        </p>
      )}
      {bad && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <p className="font-medium text-danger">
            ✕ Fonctions ({region.function_city}) et base ({region.database_city}) dans des régions différentes.
          </p>
          <p className="mt-1 text-ink-soft">
            Chaque requête SQL fait l&apos;aller-retour entre les deux : c&apos;est la
            première cause de lenteur. Correction gratuite : Vercel → projet →
            <strong> Settings → Functions → Function Region</strong> → choisir{' '}
            <strong>{region.expected_city} ({region.expected})</strong>, puis redéployer.
          </p>
        </div>
      )}
      {!local && region.matches_config === false && !bad && (
        <p className="mt-3 text-sm text-warning">
          ⚠ Les fonctions tournent en <strong>{region.function}</strong> alors que
          la configuration demande <strong>{region.expected}</strong> (réglage du
          dashboard Vercel prioritaire).
        </p>
      )}
      {local && (
        <p className="mt-3 text-xs text-ink-soft">
          Région indisponible en local : cette vérification n&apos;est significative
          qu&apos;en production (Vercel).
        </p>
      )}
    </div>
  );
}

function Check({ ok, title, good, bad }: { ok: boolean; title: string; good: string; bad: string }) {
  return (
    <div className={`rounded-xl border p-3 ${ok ? 'border-success/40 bg-success/5' : 'border-danger/40 bg-danger/5'}`}>
      <div className="text-xs text-ink-soft flex items-center gap-1.5">
        <span className={ok ? 'text-success' : 'text-danger'}>{ok ? '✓' : '✕'}</span>
        {title}
      </div>
      <div className={`text-sm font-medium mt-0.5 ${ok ? 'text-success' : 'text-danger'}`}>
        {ok ? good : bad}
      </div>
    </div>
  );
}
