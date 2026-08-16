import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { PageHeader, TextLink } from '../_components/ui';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: 'Confidentialité — HelloPos',
  description:
    'Quelles données le site HelloPos collecte, pourquoi, combien de temps elles sont conservées, et comment exercer vos droits.',
  path: '/confidentialite',
});

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2.5rem' }}>
      <h2 className="hp-h3">{title}</h2>
      <div className="hp-prose" style={{ marginTop: '1rem' }}>{children}</div>
    </section>
  );
}

export default async function PrivacyPage() {
  const p = await loadPlatform();
  const brand = p.brand_name || 'HelloPos';
  const editor = p.company_legal_name || '';
  const email = p.contact_email;

  const contact = email ? (
    <a className="hp-link" href={`mailto:${email}`}>{email}</a>
  ) : (
    <TextLink href="/contact" arrow={false}>le formulaire de contact</TextLink>
  );

  return (
    <>
      <PageHeader
        eyebrow="Vos données"
        title="Politique de confidentialité"
        lede="Ce site ne collecte que ce que vous nous écrivez, pour vous répondre. Rien de plus."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/confidentialite', label: 'Confidentialité' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-container--text" style={{ marginTop: '1rem' }}>
          <Block title="Responsable du traitement">
            <p>
              Les données transmises via ce site sont traitées par {editor || `l’éditeur de ${brand}`}.
              Pour toute question relative à vos données, écrivez à {contact}.
            </p>
          </Block>

          <Block title="Données collectées">
            <p>Nous ne collectons que les informations que vous saisissez vous-même :</p>
            <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.4rem' }}>
              <li>Formulaire de contact et de démonstration : nom, boutique, email, téléphone, sujet et message.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Aucune donnée n’est achetée, ni collectée à votre insu, ni revendue.
            </p>
          </Block>

          <Block title="Finalité et base légale">
            <p>
              Ces informations servent uniquement à répondre à votre demande et, le cas échéant, à
              préparer une relation contractuelle : démonstration, vérification de matériel, devis.
              La base légale est l’exécution de mesures précontractuelles prises à votre demande,
              ainsi que notre intérêt légitime à répondre aux sollicitations reçues.
            </p>
          </Block>

          <Block title="Destinataires">
            <p>
              Vos données sont accessibles aux personnes en charge du suivi commercial et technique
              de {brand}. Les notifications par email sont acheminées par le prestataire d’envoi
              configuré par l’éditeur, agissant comme sous-traitant.
            </p>
          </Block>

          <Block title="Durée de conservation">
            <p>
              Les demandes de contact sont conservées le temps du traitement puis pendant la durée
              nécessaire au suivi de la relation commerciale, avant suppression ou archivage.
            </p>
          </Block>

          <Block title="Vos droits">
            <p>
              Vous disposez d’un droit d’accès, de rectification, d’effacement, d’opposition, de
              limitation et de portabilité de vos données. Vous pouvez les exercer à tout moment en
              écrivant à {contact}.
            </p>
            <p>
              Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la
              Commission nationale de l’informatique et des libertés (CNIL), 3 place de Fontenoy,
              75007 Paris — cnil.fr.
            </p>
          </Block>

          <Block title="Cookies et mesure d’audience">
            <p>
              Ce site ne dépose aucun cookie publicitaire et n’utilise aucun traceur à des fins de
              profilage. Les pages du site sont servies sans cookie de suivi.
            </p>
            <p>
              Les espaces applicatifs (caisse, back-office) utilisent, eux, des cookies strictement
              nécessaires à votre session : ils sont indispensables à la connexion.
            </p>
          </Block>

          <Block title="Polices et ressources externes">
            <p>
              Les polices de caractères et les images du site sont servies depuis nos propres
              serveurs. Aucune requête n’est adressée à un tiers lors de l’affichage des pages.
            </p>
          </Block>

          <p className="hp-fine" style={{ marginTop: '3rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
            Cette politique s’applique au site public. L’utilisation du logiciel {brand} par un
            commerce fait l’objet de conditions distinctes, communiquées à la souscription.
          </p>
        </div>
      </section>
    </>
  );
}
