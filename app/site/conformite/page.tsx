import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { COMPLIANCE_POINTS } from '@/lib/site/content/home';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import Screen from '../_components/Screen';

export const metadata = pageMeta({
  title: 'Conformité — HelloPos',
  description:
    'Inaltérabilité, sécurisation, conservation et archivage des données de caisse : comment HelloPos répond à l’article 286, I, 3° bis du CGI, et ce que cela change pour votre commerce.',
  path: '/conformite',
});

const PILLARS = [
  {
    title: 'Inaltérabilité',
    icon: 'lock',
    text:
      'Chaque vente, avoir et clôture est écrit dans un journal d’événements où chaque ligne porte l’empreinte de la précédente. La base de données refuse la modification et la suppression de ces lignes.',
  },
  {
    title: 'Sécurisation',
    icon: 'shield',
    text:
      'Les pièces sont numérotées en séquence continue, horodatées, et le cumul perpétuel du grand total est tenu à jour. Une rupture se verrait.',
  },
  {
    title: 'Conservation',
    icon: 'report',
    text:
      'Les clôtures journalières, l’historique des ventes et le journal des événements restent consultables dans le logiciel.',
  },
  {
    title: 'Archivage',
    icon: 'ledger',
    text:
      'Les exports comptables — ventes par compte, écritures — se téléchargent quand vous en avez besoin, pour votre cabinet comme pour vos archives.',
  },
] as const;

export default async function CompliancePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <PageHeader
        eyebrow="Conformité"
        title={<>Une caisse pensée aussi pour les obligations qui vont avec.</>}
        lede={`En France, un logiciel de caisse doit garantir l’inaltérabilité, la sécurisation, la conservation et l’archivage des données de vente. Voici comment ${brand} s’y prend, concrètement.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/conformite', label: 'Conformité' },
        ]}
        siteUrl={SITE_URL}
      />

      <section className="hp-section">
        <div className="hp-container">
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gap: '1rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 16rem), 1fr))',
            }}
          >
            {PILLARS.map((p, i) => (
              <li
                key={p.title}
                className="hp-card"
                data-reveal
                style={{ ['--reveal-delay' as string]: `${i * 70}ms` }}
              >
                <span aria-hidden="true" style={{ color: 'var(--green)' }}>
                  <Icon name={p.icon} size={24} />
                </span>
                <h2 className="hp-h4" style={{ marginTop: '1rem' }}>{p.title}</h2>
                <p className="hp-small" style={{ marginTop: '0.6rem' }}>{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hp-section hp-on-green hp-dark">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <Eyebrow>Le texte</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Ce que dit la règle, en une phrase.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              L’article 286, I, 3° bis du code général des impôts impose aux assujettis qui
              enregistrent les règlements de leurs clients avec un logiciel de caisse d’utiliser un
              logiciel satisfaisant à des conditions d’inaltérabilité, de sécurisation, de
              conservation et d’archivage.
            </p>
          </div>
          <div className="hp-prose" data-reveal>
            <p style={{ color: 'var(--on-green-soft)' }}>
              Cette conformité se justifie soit par un certificat délivré par un organisme
              accrédité, soit par une attestation individuelle de l’éditeur du logiciel.
            </p>
            <p style={{ color: 'var(--on-green-soft)' }}>
              {brand} relève du second cas : <strong style={{ color: 'var(--on-green)' }}>l’attestation individuelle
              s’édite depuis votre espace</strong>, au nom de votre société, avec la version exacte du
              logiciel installée. Aucune certification n’est revendiquée : nous ne mentionnons que
              ce qui existe.
            </p>
            <p style={{ color: 'var(--on-green-soft)' }}>
              Elle s’imprime en un clic, depuis l’écran de conformité fiscale du logiciel.
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section hp-on-paper">
        <div className="hp-container hp-cols hp-cols--sidebar-rev">
          <div data-reveal>
            <Screen
              src="/site/screens/cloture.png"
              alt={`Écran de clôture de caisse ${brand}`}
              frame="window"
              sizes="(max-width: 900px) 100vw, 640px"
            />
          </div>
          <div data-reveal>
            <Eyebrow>Au quotidien</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Ce que ça change pour vous.
            </h2>
            <ul style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '1.25rem' }}>
              {COMPLIANCE_POINTS.map((c) => (
                <li key={c.title}>
                  <b className="hp-h4">{c.title}</b>
                  <p className="hp-small" style={{ marginTop: '0.35rem' }}>{c.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="hp-section">
        <div className="hp-container hp-container--text hp-prose">
          <Eyebrow>Précisions</Eyebrow>
          <h2 className="hp-h3" style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
            Trois choses que nous préférons écrire noir sur blanc.
          </h2>
          <p>
            <strong>Aucune certification n’est revendiquée.</strong> {brand} ne se présente ni comme
            un logiciel certifié NF525, ni comme titulaire d’un certificat délivré par un organisme
            accrédité. La preuve de conformité repose sur l’attestation individuelle de l’éditeur,
            que la loi prévoit expressément.
          </p>
          <p>
            <strong>La facturation électronique est un sujet distinct.</strong> Le logiciel comporte
            des réglages dédiés à la facturation électronique, destinés à recevoir les informations
            de votre plateforme. Nous ne publierons de calendrier ni de promesse sur ce sujet que
            lorsqu’ils seront tenus.
          </p>
          <p>
            <strong>Cette page est informative.</strong> Elle décrit le fonctionnement du logiciel et
            ne constitue ni un conseil juridique, ni un conseil comptable. Pour votre situation
            particulière, votre expert-comptable reste le bon interlocuteur.
          </p>
          <p style={{ marginTop: '2rem' }}>
            <TextLink href="/contact">Poser une question sur la conformité</TextLink>
          </p>
        </div>
      </section>

      <section className="hp-section--tight">
        <div className="hp-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem' }}>
          <Button href="/fonctionnalites#comptabilite" variant="ghost">Voir les clôtures et exports</Button>
          <Button href="/tarifs" variant="ghost" track="voir_tarifs">Voir les tarifs</Button>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="conformite" />
    </>
  );
}
