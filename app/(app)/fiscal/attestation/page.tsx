import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import pkg from '@/package.json';
import PrintButton from './PrintButton';

export const dynamic = 'force-dynamic';

type Org = {
  legal_name: string | null;
  name: string | null;
  siret: string | null;
  siren: string | null;
  vat_number: string | null;
  address: { line1?: string; zip?: string; city?: string; country?: string } | null;
};

function formatAddress(a: Org['address']): string {
  if (!a) return '—';
  const parts = [a.line1, [a.zip, a.city].filter(Boolean).join(' '), a.country]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

export default async function AttestationPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'fiscal.audit'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  const orgRes = await query<Org>(
    `SELECT legal_name, name, siret, siren, vat_number, address
       FROM organizations WHERE id = $1`,
    [user.organizationId],
  );
  const org = orgRes.rows[0];

  // Empreinte de version : version applicative + dernière migration appliquée.
  // Ce couple identifie sans ambiguïté la révision fiscale installée.
  let lastMigration = '—';
  try {
    const m = await query<{ id: string }>(
      `SELECT id FROM schema_migrations ORDER BY id DESC LIMIT 1`,
    );
    lastMigration = m.rows[0]?.id ?? '—';
  } catch { /* table absente : ignore */ }

  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <div className="p-6 md:p-8">
      {/* Règles d'impression : on isole le document, on masque le reste de l'app. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  body * { visibility: hidden !important; }
  #attestation, #attestation * { visibility: visible !important; }
  #attestation { position: absolute; left: 0; top: 0; width: 100%; padding: 0; box-shadow: none; border: 0; }
  .no-print { display: none !important; }
  @page { margin: 18mm; }
}
`,
        }}
      />

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/fiscal" className="text-sm text-ink-soft hover:underline">
          ← Retour à la conformité fiscale
        </Link>
        <PrintButton />
      </div>

      <article
        id="attestation"
        className="mx-auto max-w-3xl rounded-xl border border-border bg-white p-8 md:p-12 text-ink shadow-sm leading-relaxed"
      >
        <header className="border-b border-border pb-5">
          <div className="text-xs uppercase tracking-widest text-ink-soft">
            Logiciel de caisse — HelloPos
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Attestation individuelle de conformité
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Article 286, I, 3°bis du Code général des impôts
          </p>
        </header>

        <p className="mt-6 text-sm">
          Je soussigné, l&apos;éditeur du logiciel de caisse <strong>HelloPos</strong>,
          atteste que le logiciel identifié ci-dessous, utilisé par
          l&apos;assujetti désigné, satisfait aux conditions
          d&apos;<strong>inaltérabilité</strong>, de <strong>sécurisation</strong>,
          de <strong>conservation</strong> et d&apos;<strong>archivage</strong> des
          données prévues au 3°bis du I de l&apos;article 286 du CGI, en vue du
          contrôle de l&apos;administration fiscale.
        </p>

        <Section title="Assujetti utilisateur">
          <Field label="Raison sociale" value={org?.legal_name || org?.name || '—'} />
          <Field label="SIRET" value={org?.siret || '—'} />
          <Field label="SIREN" value={org?.siren || '—'} />
          <Field label="N° TVA intracommunautaire" value={org?.vat_number || '—'} />
          <Field label="Adresse" value={formatAddress(org?.address ?? null)} />
        </Section>

        <Section title="Logiciel attesté">
          <Field label="Éditeur" value="HelloPos" />
          <Field label="Logiciel" value="HelloPos — caisse SaaS" />
          <Field label="Version" value={`v${(pkg as { version?: string }).version ?? '—'}`} />
          <Field label="Révision fiscale (dernière migration)" value={lastMigration} />
          <Field
            label="Voie de conformité"
            value="Attestation individuelle de l'éditeur (art. 286-I-3°bis CGI)"
          />
        </Section>

        <Section title="Conditions couvertes">
          <ul className="space-y-2 text-sm">
            <Condition title="Inaltérabilité">
              Ventes validées verrouillées par déclencheur base de données ;
              journaux fiscaux <em>append-only</em> (aucune modification ni
              suppression) ; chaînage cryptographique SHA-256 (+ signature
              HMAC) ; numérotation continue sans rupture ; cumul perpétuel du
              grand total ; corrections uniquement par avoir.
            </Condition>
            <Condition title="Sécurisation">
              Authentification par session signée, mots de passe bcrypt,
              anti-force brute, habilitations RBAC (aucun droit de suppression
              d&apos;une vente validée), cloisonnement multi-boutiques,
              validation serveur systématique.
            </Condition>
            <Condition title="Conservation">
              Conservation 6 ans sans suppression possible ; snapshot figé de
              chaque ticket ; historique des prix ; les pièces fiscales
              résistent à l&apos;anonymisation RGPD.
            </Condition>
            <Condition title="Archivage">
              Clôtures journalières, mensuelles et annuelles scellées ; archives
              périodiques vérifiables (empreinte SHA-256) ; export et
              vérification de la chaîne à la demande.
            </Condition>
          </ul>
        </Section>

        <Section title="Vérifiable en direct">
          <p className="text-sm">
            L&apos;intégrité de la chaîne fiscale peut être recalculée séance
            tenante par l&apos;éditeur : chaque empreinte est recalculée et la
            continuité des index et des hachages est contrôlée
            (<code className="text-xs">npm run fiscal:verify</code> /
            <code className="text-xs"> GET /api/fiscal/verify</code>).
          </p>
        </Section>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 text-sm">
          <div>
            <div className="text-ink-soft">Fait le</div>
            <div className="font-semibold">{today}</div>
          </div>
          <div>
            <div className="text-ink-soft">Éditeur</div>
            <div className="font-semibold">HelloPos</div>
            <div className="mt-6 h-px w-full bg-border" />
            <div className="mt-1 text-xs text-ink-soft">Cachet / signature</div>
          </div>
        </div>

        <footer className="mt-8 border-t border-border pt-4 text-xs text-ink-soft">
          Références : art. 286-I-3°bis du CGI ; art. L80 O du LPF ;
          BOI-TVA-DECLA-30-10-30. Le dossier technique complet, fonction par
          fonction, est conservé par l&apos;éditeur (docs/conformite.md et
          docs/attestation-conformite.md).
        </footer>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/60 py-1.5 sm:flex-row sm:justify-between sm:gap-4">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-sm font-medium sm:text-right">{value}</span>
    </div>
  );
}

function Condition({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 text-sage">●</span>
      <span>
        <strong>{title}.</strong> {children}
      </span>
    </li>
  );
}
