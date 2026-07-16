import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PricingManager from './PricingManager';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'products.write'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <PricingManager />;
}
