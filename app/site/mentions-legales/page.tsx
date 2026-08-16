import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { PageHeader, TextLink } from '../_components/ui';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: 'Mentions légales — HelloPos',
  description: 'Mentions légales du site HelloPos : éditeur, hébergement, propriété intellectuelle et données personnelles.',
  path: '/mentions-legales',
});

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingBlock: '0.4rem', borderBottom: '1px solid var(--line-soft)' }}>
      <dt className="hp-small" style={{ minWidth: '12rem' }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}

export default async function LegalPage() {
  const p = await loadPlatform();
  const brand = p.brand_name || 'HelloPos';
  const editor = p.company_legal_name || '';
  const address = [p.address_line1, [p.address_zip, p.address_city].filter(Boolean).join(' '), p.address_country]
    .filter(Boolean)
    .join(', ');
  const hasEditor = Boolean(editor || p.company_siren || p.company_siret || address);

  return (
    <>
      <PageHeader
        eyebrow="Informations légales"
        title="Mentions légales"
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/mentions-legales', label: 'Mentions légales' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-container--text hp-prose" style={{ marginTop: '2rem' }}>
          <h2 className="hp-h3">Éditeur du site</h2>
          {hasEditor ? (
            <dl style={{ margin: '1.25rem 0 0' }}>
              <Row label="Raison sociale" value={editor || brand} />
              <Row label="SIREN" value={p.company_siren} />
              <Row label="SIRET" value={p.company_siret} />
              <Row label="TVA intracommunautaire" value={p.company_vat} />
              <Row label="Adresse" value={address} />
              <Row label="Email" value={p.contact_email} />
              <Row label="Téléphone" value={p.contact_phone} />
            </dl>
          ) : (
            <p style={{ marginTop: '1.25rem' }}>
              Les informations d’identification de l’éditeur sont renseignées dans la console
              d’administration de {brand} et s’affichent ici dès qu’elles sont enregistrées.
            </p>
          )}

          <h2 className="hp-h3" style={{ marginTop: '2.5rem' }}>Directeur de la publication</h2>
          <p style={{ marginTop: '1rem' }}>
            Le représentant légal de {editor || 'la société éditrice'}.
          </p>

          <h2 className="hp-h3" style={{ marginTop: '2.5rem' }}>Hébergement</h2>
          <p style={{ marginTop: '1rem' }}>
            Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789,
            États-Unis, et servi via son réseau de diffusion.
          </p>

          <h2 className="hp-h3" style={{ marginTop: '2.5rem' }}>Propriété intellectuelle</h2>
          <p style={{ marginTop: '1rem' }}>
            L’ensemble des contenus de ce site — textes, visuels, captures du logiciel, logo et
            marque {brand} — est protégé par le droit de la propriété intellectuelle. Toute
            reproduction ou représentation, totale ou partielle, sans autorisation écrite
            préalable, est interdite.
          </p>
          <p>
            Les polices de caractères utilisées sur ce site (Fraunces et Inter) sont diffusées sous
            licence SIL Open Font License 1.1.
          </p>

          <h2 className="hp-h3" style={{ marginTop: '2.5rem' }}>Données personnelles</h2>
          <p style={{ marginTop: '1rem' }}>
            Le traitement de vos données est décrit dans la{' '}
            <TextLink href="/confidentialite" arrow={false}>politique de confidentialité</TextLink>.
          </p>

          <p className="hp-fine" style={{ marginTop: '3rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
            Page mise à jour automatiquement à partir des informations enregistrées par l’éditeur.
          </p>
        </div>
      </section>
    </>
  );
}
