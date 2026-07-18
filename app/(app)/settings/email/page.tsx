import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import EmailSettingsForm from './EmailSettingsForm';

export const dynamic = 'force-dynamic';

/**
 * Réglages d'envoi d'emails (Brevo) — back-office uniquement.
 * Sert aux envois de factures, tickets, etc.
 */
export default async function EmailSettingsPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Ce réglage est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = await userCan(user, 'settings.write');
  return <EmailSettingsForm canWrite={canWrite} />;
}
