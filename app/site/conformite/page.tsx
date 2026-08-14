import {
  Eyebrow, ButtonPrimary, Icon, GREEN, GREEN_DEEP, GOLD, BORDER, IVORY,
} from '../_ui';

export const metadata = {
  title: 'Conformité fiscale — HelloPos',
  description:
    'Chaîne fiscale scellée (article 286 CGI), inaltérabilité, sécurisation, conservation et archivage. Rapport Z, exports comptables. HelloPos est conforme by design.',
};

const PILLARS = [
  {
    title: 'Inaltérabilité',
    icon: <Icon path={<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>} />,
    desc: 'Chaque vente, avoir et clôture est scellé par une empreinte chaînée à la précédente. Rien ne peut être modifié ou supprimé après coup.',
  },
  {
    title: 'Sécurisation',
    icon: <Icon path={<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>} />,
    desc: 'Les tickets et factures sont numérotés en séquence continue, horodatés et tracés dans un journal d’événements fiscaux.',
  },
  {
    title: 'Conservation',
    icon: <Icon path={<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>} />,
    desc: 'Rapports Z journaliers, clôtures mensuelles et annuelles, cumul perpétuel du grand total : l’historique fiscal est complet.',
  },
  {
    title: 'Archivage',
    icon: <Icon path={<><path d="M4 7h16v13H4z" /><path d="M4 7 6 3h12l2 4M9 12h6" /></>} />,
    desc: 'Exports comptables (ventes par compte, écritures) prêts pour votre expert-comptable, en CSV et Excel.',
  },
];

export default function CompliancePage() {
  return (
    <>
      <section style={{ backgroundColor: GREEN }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <Eyebrow onDark>Conformité</Eyebrow>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-white">
              Prêt pour un contrôle, sans stress.
            </h1>
            <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.85)' }}>
              HelloPos respecte l’article 286, I, 3° bis du CGI : inaltérabilité,
              sécurisation, conservation et archivage des données de caisse. La
              conformité est intégrée au produit — vous n’avez rien à cocher, rien
              à craindre.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-6 py-16 md:py-24">
        <div className="max-w-2xl">
          <Eyebrow>Les quatre exigences</Eyebrow>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">
            Inaltérabilité, sécurisation, conservation, archivage.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-2xl bg-white p-6 flex gap-4" style={{ border: `1px solid ${BORDER}` }}>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: GOLD, color: GREEN_DEEP }}>
                {p.icon}
              </div>
              <div>
                <h3 className="font-semibold text-lg">{p.title}</h3>
                <p className="mt-1.5 text-sm" style={{ color: '#5A625E' }}>{p.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ backgroundColor: IVORY, borderTop: `1px solid ${BORDER}` }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-24">
          <div className="rounded-2xl bg-white p-8 md:p-10" style={{ border: `1px solid ${BORDER}` }}>
            <Eyebrow>Ce que ça change pour vous</Eyebrow>
            <ul className="mt-5 space-y-4">
              {[
                ['Un rapport Z à chaque clôture', 'Imprimé sur l’imprimante ticket, il fige la journée : total des ventes, TVA, moyens de paiement, écart de caisse.'],
                ['Des exports pour le comptable', 'Ventes ventilées par compte comptable, écritures, en un clic — au format attendu par votre cabinet.'],
                ['Une chaîne vérifiable', 'Chaque pièce référence la précédente. En cas de contrôle, l’intégrité de la caisse est démontrable.'],
              ].map(([t, d]) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5" style={{ color: GREEN }}><Icon path={<path d="m5 12 4 4L19 6" />} /></span>
                  <span><strong>{t}.</strong> <span style={{ color: '#5A625E' }}>{d}</span></span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-6 text-center text-xs" style={{ color: '#5A625E' }}>
            Cette page est informative et ne constitue pas un conseil juridique ou comptable.
          </p>
        </div>
      </section>

      <section style={{ backgroundColor: GREEN_DEEP }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-16 md:py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Une question sur la conformité ?</h2>
          <p className="mt-4 text-lg" style={{ color: 'rgba(234,230,220,0.8)' }}>On vous répond clairement, sans jargon.</p>
          <div className="mt-8 flex justify-center" style={{ color: GOLD }}>
            <ButtonPrimary href="/contact" onDark>Poser votre question</ButtonPrimary>
          </div>
        </div>
      </section>
    </>
  );
}
