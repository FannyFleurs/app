import { Fragment } from 'react';
import { loadPlatform } from '@/lib/site/platform';
import { pageMeta, SITE_URL } from '@/lib/site/meta';
import { PLANS, COMPARE, type Cell } from '@/lib/site/content/plans';
import { FAQ } from '@/lib/site/content/faq';
import { Button, Eyebrow, FinalCta, PageHeader, TextLink } from '../_components/ui';
import { Icon } from '../_components/icons';
import Faq from '../_components/Faq';

export const metadata = pageMeta({
  title: 'Tarifs — HelloPos',
  description:
    'Trois formules HelloPos : Smart à 29 € HT/mois, Pro à 39 € HT/mois, Réseau à 69 € HT/mois. 14 jours d’essai, sans engagement. Comparatif complet des offres.',
  path: '/tarifs',
});

/** Rendu d'une valeur du comparatif : oui, non, ou précision textuelle. */
function CellValue({ value, label }: { value: Cell; label: string }) {
  if (value === true) {
    return (
      <span className="hp-yes">
        <Icon name="check" size={18} title={`Inclus dans l’offre ${label}`} />
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="hp-no" aria-label={`Non inclus dans l’offre ${label}`}>
        —
      </span>
    );
  }
  return <span>{value}</span>;
}

export default async function PricingPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const trialDays = platform.trial_days || 14;
  const addon = platform.addon_register_price || '';

  // Noms et montants affichés : réglages de la plateforme, valeurs du
  // produit par défaut (Smart 29, Pro 39, Réseau 69).
  const priceByKey: Record<string, string> = {
    smart: platform.plan_essentiel_price || '29',
    pro: platform.plan_croissance_price || '39',
    reseau: platform.plan_reseau_price || '69',
  };
  const nameByKey: Record<string, string> = {
    smart: platform.plan_essentiel_name || 'Smart',
    pro: platform.plan_croissance_name || 'Pro',
    reseau: platform.plan_reseau_name || 'Réseau',
  };

  // Sélection par identifiant : les libellés peuvent évoluer, pas les clés.
  const pricingFaq = FAQ.filter((f) => ['essai', 'engagement', 'multi-boutiques', 'materiel'].includes(f.key ?? ''));

  return (
    <>
      <PageHeader
        eyebrow="Tarifs"
        title={<>Un prix clair. Tout le logiciel.</>}
        lede={`Trois formules, la même application. ${trialDays} jours d’essai, sans engagement, résiliable depuis votre espace.`}
        crumbs={[
          { href: '/', label: 'Accueil' },
          { href: '/tarifs', label: 'Tarifs' },
        ]}
        siteUrl={SITE_URL}
      />

      {/* Cartes tarifaires */}
      <section className="hp-section--tight">
        <div className="hp-container">
          <div className="hp-plans" style={{ marginTop: '2.5rem' }}>
            {PLANS.map((p) => {
              const name = nameByKey[p.key] ?? p.name;
              const isNetwork = p.key === 'reseau';
              return (
                <div key={p.key} className="hp-plan" data-featured={p.featured ? 'true' : 'false'} data-reveal>
                  <div className="hp-plan-head">
                    <h2 className="hp-h4">{name}</h2>
                    <p className="hp-small" style={{ marginTop: '0.25rem' }}>{p.tagline}</p>
                  </div>
                  <p className="hp-plan-price">
                    <b>{priceByKey[p.key]} €</b>
                    <span className="hp-small">HT / mois</span>
                  </p>
                  <p className="hp-small">{p.audience}</p>
                  <ul>
                    {p.highlights.map((h) => (
                      <li key={h}>
                        <span aria-hidden="true" style={{ color: p.featured ? 'var(--gold)' : 'var(--green)' }}>
                          <Icon name="check" size={16} />
                        </span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
                    {isNetwork ? (
                      <Button
                        href="/contact"
                        variant={p.featured ? 'gold' : 'primary'}
                        className="hp-btn--block"
                        track="choisir_formule"
                        trackProps={{ formule: p.key }}
                      >
                        Parler de votre réseau
                      </Button>
                    ) : (
                      <Button
                        href="/setup"
                        variant={p.featured ? 'gold' : 'primary'}
                        className="hp-btn--block"
                        track="choisir_formule"
                        trackProps={{ formule: p.key }}
                      >
                        Essayer {name}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="hp-fine" style={{ marginTop: '1.5rem' }}>
            Montants en euros hors taxes, par mois.
            {addon ? ` Caisse supplémentaire sur l’offre ${nameByKey.smart} : ${addon} € HT/mois.` : ''}
            {' '}L’offre {nameByKey.reseau} s’ouvre avec nous, le temps de cadrer le nombre de boutiques.
          </p>
        </div>
      </section>

      {/* Comparatif complet */}
      <section className="hp-section hp-on-paper" id="comparatif">
        <div className="hp-container">
          <div style={{ maxWidth: '30ch' }}>
            <Eyebrow>Comparatif</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Exactement ce qui change d’une offre à l’autre.
            </h2>
            <p className="hp-lede" style={{ marginTop: '1.25rem' }}>
              Les différences portent sur le périmètre — boutiques, caisses, préparation. Le reste
              du logiciel est le même partout.
            </p>
          </div>

          {/* Grand écran : un vrai tableau. */}
          <div className="hp-table-wrap hp-compare-table" style={{ marginTop: '2.5rem' }}>
            <table className="hp-table">
              <caption>Comparatif des formules {brand}</caption>
              <thead>
                <tr>
                  <th scope="col">Fonctionnalité</th>
                  <th scope="col">{nameByKey.smart}</th>
                  <th scope="col">{nameByKey.pro}</th>
                  <th scope="col">{nameByKey.reseau}</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((g) => (
                  <Fragment key={g.title}>
                    <tr>
                      <th scope="rowgroup" colSpan={4}>{g.title}</th>
                    </tr>
                    {g.rows.map((r) => (
                      <tr key={r.label}>
                        <th scope="row" style={{ fontWeight: 500 }}>
                          {r.label}
                          {r.note ? <span className="hp-fine" style={{ display: 'block' }}>{r.note}</span> : null}
                        </th>
                        <td><CellValue value={r.smart} label={nameByKey.smart ?? 'Smart'} /></td>
                        <td><CellValue value={r.pro} label={nameByKey.pro ?? 'Pro'} /></td>
                        <td><CellValue value={r.reseau} label={nameByKey.reseau ?? 'Réseau'} /></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile : une ligne par fonctionnalité, les trois offres en clair. */}
          <div className="hp-compare-list" style={{ marginTop: '2rem' }}>
            {COMPARE.map((g) => (
              <section key={g.title} aria-label={g.title}>
                <h3 className="hp-h4" style={{ marginTop: '2rem' }}>{g.title}</h3>
                <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0 }}>
                  {g.rows.map((r) => (
                    <li key={r.label} className="hp-compare-row">
                      <p style={{ fontWeight: 500 }}>{r.label}</p>
                      {r.note ? <p className="hp-fine">{r.note}</p> : null}
                      <dl>
                        {(['smart', 'pro', 'reseau'] as const).map((k) => (
                          <div key={k}>
                            <dt>{nameByKey[k]}</dt>
                            <dd><CellValue value={r[k]} label={nameByKey[k] ?? k} /></dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="hp-fine" style={{ marginTop: '2rem' }}>
            Une fonction qui ne figure pas dans ce tableau n’existe pas encore dans {brand} : nous
            préférons le dire que le laisser entendre.
          </p>
        </div>
      </section>

      {/* Questions liées au tarif */}
      <section className="hp-section">
        <div className="hp-container hp-cols hp-cols--sidebar">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="hp-h2" style={{ marginTop: '1.25rem' }}>
              Avant de vous décider.
            </h2>
            <p style={{ marginTop: '1.5rem' }}>
              <TextLink href="/contact">Une autre question ?</TextLink>
            </p>
          </div>
          <Faq items={pricingFaq} idPrefix="faq-tarifs" />
        </div>
      </section>

      <FinalCta
        brand={brand}
        price={priceByKey.smart ?? '29'}
        trialDays={trialDays}
        emplacement="tarifs"
        title={<>Essayez, puis décidez.</>}
        lede={`${trialDays} jours pour vendre pour de vrai avec ${brand}.`}
      />
    </>
  );
}
