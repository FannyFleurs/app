import { loadPlatform } from '@/lib/site/platform';
import { pageMeta } from '@/lib/site/meta';
import { Eyebrow, Icon, GREEN, GREEN_DEEP, GOLD, BORDER } from '../_ui';
import ContactForm from './ContactForm';

export const dynamic = 'force-dynamic';
export const metadata = pageMeta({
  title: 'Contact — HelloPos',
  description:
    'Réservez une démo gratuite de HelloPos, la caisse tout-en-un des commerçants. 20 minutes, sur votre propre catalogue.',
  path: '/contact',
});

export default async function ContactPage() {
  const platform = await loadPlatform();
  const email = platform.contact_email || 'contact@hellopos.fr';
  const phone = platform.contact_phone || '';

  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <Eyebrow onDark>Contact</Eyebrow>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">Parlons de votre boutique.</h1>
            <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Une démonstration de 20 minutes, sur votre propre catalogue. On
              vous montre l’encaissement, le pilotage et la conformité — et on
              répond à toutes vos questions.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24 grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="rounded-2xl bg-white p-6 md:p-8" style={{ border: `1px solid ${BORDER}` }}>
          <h2 className="text-xl font-bold">Réservez votre démo</h2>
          <p className="mt-1 text-sm" style={{ color: '#5A625E' }}>Gratuite, 20 minutes, sur votre catalogue. On vous rappelle sous 24 h ouvrées.</p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>

        <div className="space-y-4">
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-4 rounded-2xl bg-white p-5 transition-colors hover:bg-black/[0.02]"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
              <Icon path={<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>} />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A625E' }}>Email</span>
              <span className="block font-medium" style={{ color: GREEN }}>{email}</span>
            </span>
          </a>

          {phone && (
            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="flex items-center gap-4 rounded-2xl bg-white p-5 transition-colors hover:bg-black/[0.02]"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                <Icon path={<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.5-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2Z" />} />
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A625E' }}>Téléphone</span>
                <span className="block font-medium" style={{ color: GREEN }}>{phone}</span>
              </span>
            </a>
          )}

          <div className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#5A625E' }}>Comment ça se passe</div>
            <ol className="mt-4 space-y-3.5">
              {[
                'On échange 20 minutes sur votre boutique et vos besoins.',
                'On prépare la démo sur votre propre catalogue.',
                'Vous testez 14 jours, sans carte bancaire.',
              ].map((t, i) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ backgroundColor: GREEN, color: '#fff' }}>{i + 1}</span>
                  <span className="text-sm" style={{ color: '#14211D' }}>{t}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 pt-4 text-xs" style={{ color: '#5A625E', borderTop: `1px solid ${BORDER}` }}>
              Sans engagement · Réponse sous 24 h ouvrées · Vos données restent les vôtres.
            </p>
          </div>

          <div className="rounded-2xl p-5" style={{ backgroundColor: GREEN, color: '#fff' }}>
            <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: GOLD }}>Déjà client ?</div>
            <p className="mt-2 text-sm" style={{ color: 'rgba(234,230,220,0.85)' }}>
              Accédez à votre caisse ou à votre back-office.
            </p>
            <div className="mt-4 flex gap-2">
              <a href="/login" className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-semibold" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>Caisse</a>
              <a href="/bo" className="inline-flex items-center h-10 px-4 rounded-xl text-sm font-medium" style={{ color: GOLD, border: `1px solid rgba(255,239,179,0.4)` }}>Back-office</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
