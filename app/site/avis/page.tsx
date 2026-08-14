import { loadPlatform } from '@/lib/site/platform';
import { REVIEWS, REVIEW_AVG } from '@/lib/site/reviews';
import { pageMeta } from '@/lib/site/meta';
import {
  Eyebrow, ButtonPrimary, ButtonGhost, Stars, initials, GREEN_DEEP, GOLD, BORDER, IVORY, GREEN,
} from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'Avis clients — HelloPos',
  description:
    'Ce que les commerçants disent de HelloPos : encaissement rapide, commande différée, pilotage à distance, clôture guidée et conformité. Une note moyenne de 4,9 sur 5.',
  path: '/avis',
});

export default async function ReviewsPage() {
  const platform = await loadPlatform();
  const brand = platform.brand_name || 'HelloPos';
  const avg = REVIEW_AVG;

  return (
    <>
      {/* -------------------------------------------------------------- HERO */}
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <Eyebrow onDark>Avis clients</Eyebrow>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">
              Ils ont adopté {brand}.
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Des commerçants de tous horizons utilisent {brand} au quotidien.
              Voici, avec leurs mots, ce qui les a convaincus.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full px-4 py-2"
                 style={{ backgroundColor: 'rgba(255,239,179,0.15)' }}>
              <Stars n={5} />
              <span className="text-sm font-semibold" style={{ color: GOLD }}>
                {avg} / 5 · note moyenne
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- REVIEWS */}
      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
          {REVIEWS.map((r) => (
            <figure
              key={r.name + r.shop}
              className="break-inside-avoid mb-5 rounded-2xl bg-white p-6"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <Stars n={r.stars} />
              <blockquote className="mt-4 text-[15px] leading-relaxed" style={{ color: '#14211D' }}>
                « {r.quote} »
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                      style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                  {initials(r.name)}
                </span>
                <span className="leading-tight">
                  <span className="block font-semibold text-sm" style={{ color: '#14211D' }}>{r.name}</span>
                  <span className="block text-sm" style={{ color: '#5A625E' }}>{r.shop} · {r.city}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-8 text-center text-xs" style={{ color: '#5A625E' }}>
          Témoignages de commerçants utilisateurs. Prénoms abrégés pour préserver leur confidentialité.
        </p>
      </section>

      {/* --------------------------------------------------------- CTA BAND */}
      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Envie de faire partie d’eux ?</h2>
          <p className="mt-4 text-lg" style={{ color: '#5A625E' }}>
            Réservez une démo : on vous montre {brand} sur votre propre catalogue, en 20 minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonPrimary href="/contact">Réserver une démo gratuite</ButtonPrimary>
            <ButtonGhost href="/tarifs">Voir les tarifs</ButtonGhost>
          </div>
        </div>
      </section>
    </>
  );
}
