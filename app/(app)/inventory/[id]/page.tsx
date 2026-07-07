import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import InventoryDetail from './InventoryDetail';

export const dynamic = 'force-dynamic';

export default async function InventoryDetailPage({ params }: { params: { id: string } }) {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'stock.adjust'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  return <InventoryDetail inventoryId={params.id} />;
}
