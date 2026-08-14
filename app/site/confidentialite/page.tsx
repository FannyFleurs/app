import { loadPlatform } from '@/lib/site/platform';
import { pageMeta } from '@/lib/site/meta';
import { Eyebrow, GREEN, BORDER } from '../_ui';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'Politique de confidentialité — HelloPos',
  description:
    'Comment HelloPos collecte, utilise et protège vos données personnelles. Vos droits et comment les exercer.',
  path: '/confidentialite',
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm md:text-base leading-relaxed" style={{ color: '#5A625E' }}>
        {children}
      </div>
    </div>
  );
}

export default async function PrivacyPage() {
  const p = await loadPlatform();
  const brand = p.brand_name || 'HelloPos';
  const editor = p.company_legal_name || brand;
  const email = p.contact_email || 'contact@hellopos.fr';

  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <Eyebrow onDark>Vos données</Eyebrow>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">Politique de confidentialité</h1>
          <p className="mt-4 text-lg max-w-2xl" style={{ color: 'rgba(234,230,220,0.85)' }}>
            On ne collecte que ce qui est nécessaire pour vous répondre, et vous
            gardez le contrôle sur vos données.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-5 sm:px-6 py-16 md:py-24 space-y-10">
        <Section title="Responsable du traitement">
          <p>
            Les données collectées sur ce site sont traitées par {editor}. Pour
            toute question, écrivez à{' '}
            <a href={`mailto:${email}`} className="font-medium underline" style={{ color: GREEN }}>{email}</a>.
          </p>
        </Section>

        <Section title="Données collectées">
          <p>Nous collectons uniquement les données que vous nous transmettez :</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Formulaire de démo / contact : nom, boutique, email, téléphone et message.</li>
            <li>Inscription à la liste email : votre adresse email.</li>
          </ul>
          <p>Aucune donnée n’est achetée ni collectée à votre insu.</p>
        </Section>

        <Section title="Finalités et base légale">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Répondre à vos demandes de démonstration et de contact (intérêt légitime / mesures précontractuelles).</li>
            <li>Vous envoyer nos conseils et nouveautés si vous vous êtes inscrit (consentement).</li>
          </ul>
        </Section>

        <Section title="Destinataires">
          <p>
            Vos données sont accessibles à l’équipe {brand}. Nos emails sont
            envoyés via notre prestataire d’emailing Brevo (Sendinblue SAS, France),
            en qualité de sous-traitant. Aucune donnée n’est revendue.
          </p>
        </Section>

        <Section title="Durée de conservation">
          <p>
            Les demandes de contact sont conservées le temps nécessaire au suivi
            commercial, puis archivées ou supprimées. Les inscriptions email sont
            conservées jusqu’à votre désinscription.
          </p>
        </Section>

        <Section title="Vos droits">
          <p>
            Vous disposez d’un droit d’accès, de rectification, d’effacement,
            d’opposition, de limitation et de portabilité de vos données. Vous
            pouvez les exercer à tout moment en écrivant à{' '}
            <a href={`mailto:${email}`} className="font-medium underline" style={{ color: GREEN }}>{email}</a>.
            Chaque email d’information contient également un lien de désinscription.
          </p>
          <p>
            Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr)
            si vous estimez que vos droits ne sont pas respectés.
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            Ce site n’utilise que des cookies strictement nécessaires à son
            fonctionnement. Aucun cookie de traçage publicitaire n’est déposé.
          </p>
        </Section>

        <p className="text-xs pt-6" style={{ color: '#5A625E', borderTop: `1px solid ${BORDER}` }}>
          Dernière mise à jour : 2026.
        </p>
      </section>
    </>
  );
}
