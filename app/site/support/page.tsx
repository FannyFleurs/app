import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { PageHeader, TextLink } from '../_components/ui';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: 'Support — HelloPos',
  description:
    'Aide et assistance HelloPos : comment nous contacter, ce qu’il faut préciser, et où trouver de l’aide dans l’application.',
  path: '/support',
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h2 className="hp-h3">{title}</h2>
      <div className="hp-prose" style={{ marginTop: '1rem' }}>{children}</div>
    </section>
  );
}

export default async function SupportPage() {
  const p = await loadPlatform();
  const brand = p.brand_name || 'HelloPos';
  const email = p.contact_email;
  const phone = p.contact_phone;

  return (
    <>
      <PageHeader
        eyebrow="Aide"
        title="Support HelloPos"
        lede="Une question sur la caisse, une imprimante, votre compte ? On vous répond."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/support', label: 'Support' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-container--text" style={{ marginTop: '1rem' }}>
          <Block title="Nous contacter">
            <p>Pour toute demande d’assistance sur {brand} :</p>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.5rem' }}>
              {email && (
                <li>
                  Par email : <a className="hp-link" href={`mailto:${email}`}>{email}</a>
                </li>
              )}
              {phone && (
                <li>
                  Par téléphone : <a className="hp-link" href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
                </li>
              )}
              <li>
                Via le <TextLink href="/contact" arrow={false}>formulaire de contact</TextLink> du site.
              </li>
            </ul>
            {!email && (
              <p style={{ marginTop: '1rem' }}>
                Les coordonnées de l’assistance sont renseignées par l’éditeur et s’affichent ici
                une fois enregistrées.
              </p>
            )}
          </Block>

          <Block title="Depuis l’application">
            <p>
              Dans l’application {brand} (caisse iPad / iPhone ou navigateur), l’entrée
              <strong> « Assistance »</strong> permet d’envoyer une demande directement à notre
              équipe, avec le contexte de votre boutique. C’est le chemin le plus rapide quand vous
              êtes en caisse.
            </p>
          </Block>

          <Block title="Pour un traitement plus rapide">
            <p>Quand vous nous écrivez, précisez si possible :</p>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
              <li>le nom de votre boutique et l’appareil utilisé (iPad, iPhone, ordinateur) ;</li>
              <li>ce que vous faisiez et ce qui s’est passé (message d’erreur exact si possible) ;</li>
              <li>une capture d’écran quand c’est pertinent.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Nous traitons les demandes dans les meilleurs délais pendant les jours ouvrés, en
              priorisant ce qui bloque l’encaissement.
            </p>
          </Block>

          <Block title="Matériel (imprimantes, tiroir, scanner)">
            <p>
              Pour l’installation d’une imprimante ticket réseau, d’un tiroir-caisse ou d’un
              scanner, consultez d’abord la page <TextLink href="/materiel" arrow={false}>Matériel</TextLink>.
              Si le problème persiste, contactez-nous avec la marque et le modèle de l’appareil.
            </p>
          </Block>

          <Block title="Vos données et vos droits">
            <p>
              Le traitement de vos données est décrit dans notre{' '}
              <TextLink href="/confidentialite" arrow={false}>politique de confidentialité</TextLink>.
              Les informations légales de l’éditeur figurent dans les{' '}
              <TextLink href="/mentions-legales" arrow={false}>mentions légales</TextLink>.
            </p>
          </Block>
        </div>
      </section>
    </>
  );
}
