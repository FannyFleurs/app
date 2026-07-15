import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PageHeader from '@/components/PageHeader';

export const dynamic = 'force-dynamic';

export default async function FiscalPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'fiscal.audit'))) {
    return <div className="p-8">Accès refusé.</div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-5">
      <PageHeader
        title="Conformité fiscale"
        subtitle="Votre caisse respecte la réglementation française anti-fraude à la TVA."
      />

      <section className="card p-6 md:p-8 bg-sage-soft/40 max-w-2xl">
        <h2 className="text-lg font-semibold">Attestation de conformité</h2>
        <p className="mt-2 text-sm text-ink-soft">
          En cas de contrôle de l&apos;administration fiscale, ce document
          prouve que votre logiciel de caisse est conforme aux exigences
          légales (inaltérabilité, sécurisation, conservation et archivage des
          données). Il est établi au nom de votre société — imprimez-le ou
          gardez-le en PDF pour le présenter à tout moment.
        </p>
        <a
          href="/fiscal/attestation"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Ouvrir mon attestation →
        </a>
      </section>
    </div>
  );
}
