import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

// Détail technique de la conformité fiscale — réservé à l'éditeur (admin SaaS).
// Documente les mécanismes en place ; les données par organisation restent
// dans l'espace de chaque client (écran Conformité fiscale) et via l'API/CLI
// de vérification de chaîne.
export default function AdminFiscalPage() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Conformité fiscale — détail technique"
        subtitle="Mécanismes d'inaltérabilité, sécurisation, conservation et archivage garantis par HelloPos (art. 286-I-3°bis du CGI)."
      />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Condition
          title="1 · Inaltérabilité"
          items={[
            'Trigger Postgres bloquant UPDATE/DELETE sur 12 tables append-only',
            'Hash chaîné SHA-256 / HMAC sur tous les événements fiscaux',
            'Numérotation séquentielle sans rupture par année',
            'Cumul perpétuel TTC inscrit dans chaque événement',
            'Triggers d’immutabilité sur ventes & factures validées',
            'Correction uniquement par avoir lié à la vente d’origine',
          ]}
        />
        <Condition
          title="2 · Sécurisation"
          items={[
            'Sessions signées + mots de passe bcrypt (12 tours)',
            'Verrouillage anti-force brute (8 échecs / 15 min)',
            'RBAC 7 rôles + permission void_validated_sale = ∅',
            'Cloisonnement multi-boutiques (organization_id + RLS)',
            'Validation zod côté serveur sur toutes les routes',
            'Secrets jamais exposés au front ; clé fiscale isolée',
          ]}
        />
        <Condition
          title="3 · Conservation"
          items={[
            'Conservation 6 ans, aucune suppression physique possible',
            'Snapshot ticket figé en JSONB dans receipts',
            'Historique des prix produit (append-only avec auteur)',
            'Pièces fiscales préservées malgré l’anonymisation RGPD',
          ]}
        />
        <Condition
          title="4 · Archivage"
          items={[
            'Clôtures journalières / mensuelles / annuelles scellées',
            'Sessions de caisse scellées à la fermeture',
            'Archives périodiques vérifiables (empreinte SHA-256)',
            'Audit applicatif append-only séparé du journal fiscal',
          ]}
        />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Vérification d&apos;intégrité de la chaîne</h2>
        <p className="mt-2 text-sm text-ink-soft">
          La chaîne fiscale de chaque organisation peut être rejouée intégralement :
          recalcul de chaque empreinte + contrôle de la continuité (index et
          <code className="mx-1 rounded bg-bg px-1 text-xs">previous_hash</code>).
          Toute retouche d&apos;un événement casse la chaîne et est détectée.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <Tool cmd="npm run fiscal:verify" desc="Vérificateur en ligne de commande" />
          <Tool cmd="GET /api/fiscal/verify" desc="Vérification à la demande (API)" />
        </div>
      </section>

      <section className="card p-5 bg-sage-soft/40">
        <h2 className="font-semibold">Dossiers de référence</h2>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">
          <li>
            <code className="rounded bg-white px-1 text-xs">docs/conformite.md</code>
            {' '}— dossier technique complet, fonction par fonction.
          </li>
          <li>
            <code className="rounded bg-white px-1 text-xs">docs/attestation-conformite.md</code>
            {' '}— dossier de contrôle et attestation individuelle de l&apos;éditeur.
          </li>
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          Côté client, l&apos;attestation nominative (au nom de la société) est
          générée depuis leur écran <strong>Conformité fiscale</strong>.
        </p>
      </section>
    </div>
  );
}

function Condition({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <span className="mt-0.5 text-sage">●</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tool({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <code className="text-xs font-medium">{cmd}</code>
      <div className="mt-1 text-xs text-ink-soft">{desc}</div>
    </div>
  );
}
