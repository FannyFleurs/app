import { headers } from 'next/headers';
import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { accessibleStores } from '@/lib/auth/stores-server';
import CategoriesAdmin from './CategoriesAdmin';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const user = (await readSessionFromCookie())!;
  // Back-office : sélection multi-boutiques des catégories. Hors BO, la
  // catégorie est rattachée automatiquement à la boutique de l'utilisateur.
  const backOffice = headers().get('x-webpos-bo') === '1';
  // Boutiques accessibles à l'utilisateur : en BO pour la multi-sélection, et
  // dans l'app pour scoper la suppression à SA boutique (chaque caisse a la main).
  const stores = await accessibleStores(user);
  return (
    <CategoriesAdmin
      canEdit={(await userCan(user, 'categories.write'))}
      backOffice={backOffice}
      stores={stores}
    />
  );
}
