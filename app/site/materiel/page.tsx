import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { HARDWARE } from '@/lib/site/content/hardware';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import Screen from '../_components/Screen';
import TrackView from '../_components/TrackView';

export const metadata = pageMeta({
  title: 'Matériel — HelloPos',
  description:
    'Tablette, imprimante ticket Star CloudPRNT, tiroir-caisse, lecture de code-barres, imprimante étiquettes, PDA, écran atelier : le matériel qui fonctionne avec HelloPos.',
  path: '/materiel',
});

const STATUS_LABEL: Record<string, string> = {
  supported: 'Pris en charge',
  optional: 'En option',
  'to-check': 'À vérifier ensemble',
};

export default async function HardwarePage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const price = platform.plan_essentiel_price || '29';
  const trialDays = platform.trial_days || 14;

  return (
    <>
      <TrackView event="materiel" />

      <PageHeader
        eyebrow="Matériel"
        title={<>{brand} s’adapte à votre comptoir.</>}
        lede="Une tablette suffit pour commencer. Le reste s’ajoute au rythme de la boutique — et uniquement ce qui fonctionne vraiment."
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/materiel', label: 'Matériel' },
        ]}
        siteUrl={SITE_URL}
        actions={
          <>
            <Button href="/contact?sujet=materiel">Vérifier mon matériel</Button>
            <Button href="/setup" variant="ghost" track="essai_hellopos" trackProps={{ emplacement: 'materiel' }}>
              Essayer {brand}
            </Button>
          </>
        }
      />

      <section className="hp-section--tight">
        <div className="hp-container">
          <div className="hp-cols hp-cols--sidebar-rev" style={{ marginTop: '2rem' }}>
            <div data-reveal>
              <Screen
                src="/site/screens/caisse.png"
                alt={`Écran de caisse ${brand} sur tablette`}
                frame="tablet"
                sizes="(max-width: 900px) 100vw, 640px"
              />
            </div>
            <div data-reveal>
              <p className="hp-lede">
                {brand} s’utilise dans le navigateur : rien à installer, rien à mettre à jour. Les
                imprimantes se pilotent en réseau, sans boîte de dialogue, sans pilote à
                maintenir sur un poste.
              </p>
            </div>
          </div>
        </div>
      </section>

      {HARDWARE.map((group, gi) => (
        <section key={group.title} className={`hp-section${gi === 1 ? ' hp-on-paper' : ''}`}>
          <div className="hp-container">
            <div className="hp-cols hp-cols--2" style={{ alignItems: 'end' }}>
              <div data-reveal>
                <Eyebrow>{`0${gi + 1}`}</Eyebrow>
                <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>{group.title}</h2>
              </div>
              <p className="hp-lede" data-reveal>{group.intro}</p>
            </div>

            <ul
              style={{
                listStyle: 'none',
                margin: 'clamp(2rem, 3vw, 3rem) 0 0',
                padding: 0,
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 17rem), 1fr))',
              }}
            >
              {group.items.map((item, i) => (
                <li
                  key={item.name}
                  className="hp-card"
                  data-reveal
                  style={{ ['--reveal-delay' as string]: `${i * 70}ms` }}
                >
                  <span aria-hidden="true" style={{ color: 'var(--green)' }}>
                    <Icon name={item.icon} size={24} />
                  </span>
                  <h3 className="hp-h4" style={{ marginTop: '1rem' }}>{item.name}</h3>
                  <p className="hp-fine" style={{ marginTop: '0.15rem' }}>{item.role}</p>
                  <p className="hp-small" style={{ marginTop: '0.75rem' }}>{item.detail}</p>
                  <p className="hp-chip" style={{ marginTop: '1rem' }}>
                    <Icon name={item.status === 'to-check' ? 'spark' : 'check'} size={14} />
                    {STATUS_LABEL[item.status]}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="hp-section hp-on-gold">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div data-reveal>
            <h2 className="hp-h2">
              Vous êtes déjà équipé ?
              <br />
              Vérifions ensemble votre matériel.
            </h2>
          </div>
          <div data-reveal>
            <p className="hp-lede" style={{ color: 'var(--green-deep)', opacity: 0.85 }}>
              Envoyez-nous les références de votre imprimante, de votre tiroir et de votre
              douchette. Nous vous répondons précisément : ce qui fonctionne, ce qui ne fonctionne
              pas, et ce que ça change pour vous.
            </p>
            <div style={{ marginTop: '2rem' }}>
              <Button href="/contact?sujet=materiel" arrow>
                Vérifier mon matériel
              </Button>
            </div>
            <p className="hp-fine" style={{ marginTop: '1.5rem' }}>
              Nous n’annonçons jamais une compatibilité que nous n’avons pas constatée.
            </p>
          </div>
        </div>
      </section>

      <section className="hp-section--tight">
        <div className="hp-container">
          <p>
            <TextLink href="/fonctionnalites">Voir ce que fait {brand}</TextLink>
            {' '}
            <span aria-hidden="true" style={{ color: 'var(--ink-faint)', margin: '0 0.75rem' }}>·</span>
            <TextLink href="/tarifs" track="voir_tarifs">Voir les tarifs</TextLink>
          </p>
        </div>
      </section>

      <FinalCta brand={brand} price={price} trialDays={trialDays} emplacement="materiel" />
    </>
  );
}
