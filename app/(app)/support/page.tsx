import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PageHeader from '@/components/PageHeader';
import SupportClient from './SupportClient';

export const dynamic = 'force-dynamic';

/**
 * Assistance : signaler un problème ou demander une amélioration, depuis la
 * caisse comme depuis le back-office.
 *
 * La demande part avec l'écran d'où elle est écrite, le poste et, si le
 * commerçant le veut, une capture. Elle arrive dans la console de l'opérateur
 * et par email ; la réponse revient ici, et s'affiche sur l'écran où la
 * demande a été faite.
 */
export default async function SupportPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'support.request'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const backOffice = headers().get('x-webpos-bo') === '1';

  return (
    <div className="p-6 md:p-8 space-y-5 max-w-3xl">
      <PageHeader
        title="Assistance"
        subtitle="Un problème, une idée d'amélioration : écrivez-nous d'ici. Nous répondons dans cette page, et sur l'écran d'où part la demande."
      />
      <SupportClient appArea={backOffice ? 'bo' : 'caisse'} />
    </div>
  );
}
