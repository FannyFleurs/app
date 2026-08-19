import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { PageHeader, TextLink } from '../_components/ui';

export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: 'Confidentialité — HelloPos',
  description:
    'Quelles données HelloPos traite (site et application de caisse), pourquoi, avec quels sous-traitants, combien de temps, et comment exercer vos droits.',
  path: '/confidentialite',
});

function PartTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="hp-h2" style={{ marginTop: '3.5rem' }}>{children}</h2>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: '2.25rem' }}>
      <h3 className="hp-h3">{title}</h3>
      <div className="hp-prose" style={{ marginTop: '1rem' }}>{children}</div>
    </section>
  );
}

const ul = { margin: '0.75rem 0 0', paddingLeft: '1.25rem', display: 'grid', gap: '0.45rem' } as const;

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
        lede="Ce que nous traitons, pourquoi, avec qui, et pour combien de temps — pour le site comme pour le logiciel de caisse."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/confidentialite', label: 'Confidentialité' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section--tight">
        <div className="hp-container hp-container--text" style={{ marginTop: '1rem' }}>
          <p className="hp-prose">
            Cette politique couvre deux périmètres distincts : le <strong>site vitrine</strong>{' '}
            hellopos.fr (partie 1) et l’<strong>application {brand}</strong>, le logiciel de caisse
            utilisé par les commerces abonnés (partie 2).
          </p>

          {/* ------------------------------------------------------------ */}
          <PartTitle>Partie 1 — Le site hellopos.fr</PartTitle>

          <Block title="Responsable du traitement">
            <p>
              Les données transmises via ce site sont traitées par {editor || `l’éditeur de ${brand}`}.
              Pour toute question relative à vos données, écrivez à {contact}.
            </p>
          </Block>

          <Block title="Données collectées">
            <p>Sur le site, nous ne collectons que ce que vous saisissez vous-même :</p>
            <ul style={ul}>
              <li>Formulaire de contact et de démonstration : nom, boutique, email, téléphone, sujet et message.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Aucune donnée n’est achetée, ni collectée à votre insu, ni revendue. Le site ne dépose
              aucun cookie publicitaire ni traceur de profilage.
            </p>
          </Block>

          <Block title="Finalité et base légale">
            <p>
              Ces informations servent uniquement à répondre à votre demande et, le cas échéant, à
              préparer une relation contractuelle (démonstration, devis). La base légale est
              l’exécution de mesures précontractuelles prises à votre demande et notre intérêt
              légitime à répondre aux sollicitations reçues. Les notifications par email sont
              acheminées par notre prestataire d’envoi (voir « Sous-traitants » en partie 2).
            </p>
          </Block>

          <Block title="Durée de conservation">
            <p>
              Les demandes de contact sont conservées le temps du traitement puis pendant la durée
              nécessaire au suivi de la relation commerciale, avant suppression ou archivage.
            </p>
          </Block>

          {/* ------------------------------------------------------------ */}
          <PartTitle>Partie 2 — L’application {brand} (logiciel de caisse)</PartTitle>

          <Block title="Rôles : qui est responsable de quoi">
            <p>
              Lorsqu’un commerce utilise {brand}, <strong>le commerce est responsable de traitement</strong>{' '}
              des données de ses propres clients (fichier client, ventes). {editor || 'L’éditeur'} agit
              comme <strong>sous-traitant</strong>, sur les instructions du commerce et pour lui fournir
              le service. Pour les données de compte et de facturation de l’abonnement, l’éditeur est
              responsable de traitement.
            </p>
          </Block>

          <Block title="Données traitées dans l’application">
            <ul style={ul}>
              <li><strong>Compte et boutique</strong> : utilisateurs (nom, email, rôle, mot de passe stocké sous forme chiffrée), informations légales de l’établissement (SIRET, adresse, coordonnées bancaires pour les factures).</li>
              <li><strong>Clients du commerce</strong> (saisis par le commerçant) : nom, téléphone, email, adresse, historique d’achats, fidélité, avoirs et cartes cadeaux.</li>
              <li><strong>Ventes et données fiscales</strong> : tickets, ventes, événements fiscaux inaltérables (scellés), <strong>méthode et montant</strong> des règlements.</li>
              <li><strong>Données techniques</strong> : cookies de session strictement nécessaires, identifiant d’appairage du poste de caisse, journaux d’audit (traçabilité réglementaire).</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              {brand} <strong>n’enregistre jamais les numéros de carte bancaire</strong> : les paiements
              par carte sont réalisés sur votre terminal ou par notre prestataire de paiement ; seuls
              le mode de règlement et le montant sont conservés.
            </p>
          </Block>

          <Block title="Finalités et bases légales">
            <ul style={ul}>
              <li>Fournir le service de caisse et ses fonctions (ventes, clients, stocks, factures) — <em>exécution du contrat</em>.</li>
              <li>Respecter les obligations comptables et fiscales, dont l’inaltérabilité des données (art. 286, I, 3°bis du CGI) — <em>obligation légale</em>.</li>
              <li>Assurer la sécurité, prévenir la fraude et fournir le support — <em>intérêt légitime</em>.</li>
              <li>Facturer l’abonnement — <em>exécution du contrat</em>.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Les envois d’emails du commerçant à ses clients (ticket, facture, message) relèvent de
              la responsabilité du commerçant.
            </p>
          </Block>

          <Block title="Sous-traitants et hébergement">
            <p>
              Les données sont traitées par des prestataires techniques agissant comme sous-traitants,
              encadrés contractuellement. Aucune donnée n’est revendue.
            </p>
            <ul style={ul}>
              <li><strong>Hébergement de l’application</strong> : Vercel Inc. (États-Unis), via son réseau de diffusion.</li>
              <li><strong>Base de données</strong> : Neon (PostgreSQL managé).</li>
              <li><strong>Envoi d’emails</strong> (tickets, factures, notifications) : Brevo.</li>
              <li><strong>Paiements par lien et facturation de l’abonnement</strong> : Stripe.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Certains prestataires sont situés hors de l’Union européenne ; les transferts éventuels
              sont encadrés par les garanties appropriées (notamment les clauses contractuelles types
              de la Commission européenne).
            </p>
          </Block>

          <Block title="Application iPad / iPhone et réseau local">
            <p>
              L’application native est une coque sécurisée autour du service hébergé. Elle utilise le
              <strong> réseau local</strong> uniquement pour envoyer les tickets à l’imprimante de la
              boutique et ouvrir le tiroir-caisse : aucune donnée personnelle n’est transmise à un
              tiers par cette fonction, et rien ne quitte l’établissement pour cet usage.
            </p>
            <p>
              L’application n’utilise <strong>aucun identifiant publicitaire</strong> ni traceur tiers
              à des fins de suivi ou de profilage.
            </p>
          </Block>

          <Block title="Durée de conservation">
            <p>
              Les données de compte et de fichier client sont conservées pendant la durée du contrat.
              Les données comptables et fiscales sont conservées conformément aux obligations légales
              (à ce titre, la durée de conservation applicable aux pièces comptables et fiscales, de
              l’ordre de 6 à 10 ans selon leur nature). À la fin du contrat, les données sont
              supprimées ou archivées selon ces obligations.
            </p>
          </Block>

          <Block title="Sécurité">
            <p>
              Les échanges sont chiffrés en transit (HTTPS). L’accès est contrôlé par rôle, les mots
              de passe sont stockés hachés, et les données fiscales sont protégées par une chaîne
              inaltérable scellée en base (déclencheurs append-only).
            </p>
          </Block>

          <Block title="Vos droits">
            <p>
              Vous disposez d’un droit d’accès, de rectification, d’effacement, d’opposition, de
              limitation et de portabilité.
            </p>
            <ul style={ul}>
              <li>Si vous êtes <strong>client d’un commerce</strong> utilisant {brand}, adressez votre demande directement à ce commerce (responsable de traitement) ; nous l’assistons pour y répondre.</li>
              <li>Si vous êtes <strong>utilisateur du logiciel</strong> ou pour toute question sur le site, écrivez à {contact}.</li>
            </ul>
            <p style={{ marginTop: '1rem' }}>
              Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la Commission
              nationale de l’informatique et des libertés (CNIL), 3 place de Fontenoy, 75007 Paris —
              cnil.fr.
            </p>
          </Block>

          <p className="hp-fine" style={{ marginTop: '3rem', borderTop: '1px solid var(--line)', paddingTop: '1.5rem' }}>
            Les conditions contractuelles d’utilisation du logiciel {brand} par un commerce, ainsi que
            l’accord de sous-traitance (RGPD) applicable, sont communiqués à la souscription.
          </p>
        </div>
      </section>
    </>
  );
}
