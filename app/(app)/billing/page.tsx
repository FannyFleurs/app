import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import BillingManager from './BillingManager';

export const dynamic = 'force-dynamic';

/**
 * Facturation (back-office) : règlement des clients « en compte ».
 * Réservée au back-office (sous-domaine bo.) et à la permission customers.read.
 */
export default async function BillingPage() {
  const user = (await readSessionFromCookie())!;
  const backOffice = headers().get('x-webpos-bo') === '1';
  if (!backOffice) {
    return <div className="p-8 text-sm text-ink-soft">Cette page est disponible depuis le back-office.</div>;
  }
  if (!(await userCan(user, 'customers.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canInvoice = await userCan(user, 'invoices.create');
  return <BillingManager canInvoice={canInvoice} />;
}
