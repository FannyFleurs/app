import { loadPlatform } from '@/lib/site/platform';
import { pageMeta } from '@/lib/site/meta';
import { Eyebrow, GREEN, BORDER } from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'Mentions légales — HelloPos',
  description: 'Mentions légales du site HelloPos : éditeur, hébergement et propriété intellectuelle.',
  path: '/mentions-legales',
});

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-sm md:text-base leading-relaxed" style={{ color: '#14211D' }}>
      <span style={{ color: '#5A625E' }}>{label} : </span>{value}
    </p>
  );
}

export default async function LegalPage() {
  const p = await loadPlatform();
  const brand = p.brand_name || 'HelloPos';
  const editor = p.company_legal_name || brand;
  const address = [p.address_line1, [p.address_zip, p.address_city].filter(Boolean).join(' '), p.address_country]
    .filter(Boolean).join(', ');

  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <Eyebrow onDark>Informations légales</Eyebrow>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">Mentions légales</h1>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 sm:px-6 py-16 md:py-24 space-y-10">
        <div>
          <h2 className="text-xl font-bold">Éditeur du site</h2>
          <div className="mt-3 space-y-1.5">
            <Row label="Raison sociale" value={editor} />
            <Row label="SIREN" value={p.company_siren} />
            <Row label="SIRET" value={p.company_siret} />
            <Row label="TVA intracommunautaire" value={p.company_vat} />
            <Row label="Adresse" value={address} />
            <Row label="Email" value={p.contact_email} />
            <Row label="Téléphone" value={p.contact_phone} />
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold">Hébergement</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed" style={{ color: '#5A625E' }}>
            Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789,
            États-Unis. Les données sont servies via son réseau de diffusion.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold">Propriété intellectuelle</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed" style={{ color: '#5A625E' }}>
            L’ensemble des contenus de ce site (textes, visuels, logo, marque {brand})
            est protégé par le droit de la propriété intellectuelle. Toute reproduction
            ou représentation, totale ou partielle, sans autorisation écrite préalable,
            est interdite.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-bold">Données personnelles</h2>
          <p className="mt-3 text-sm md:text-base leading-relaxed" style={{ color: '#5A625E' }}>
            Le traitement de vos données personnelles est décrit dans notre{' '}
            <a href="/confidentialite" className="font-medium underline" style={{ color: GREEN }}>politique de confidentialité</a>.
          </p>
        </div>

        <p className="text-xs pt-6" style={{ color: '#5A625E', borderTop: `1px solid ${BORDER}` }}>
          Dernière mise à jour : 2026.
        </p>
      </section>
    </>
  );
}
