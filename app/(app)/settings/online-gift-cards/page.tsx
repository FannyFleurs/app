import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import OnlineGiftCardsSettingsForm from './OnlineGiftCardsSettingsForm';

export const dynamic = 'force-dynamic';

export default async function OnlineGiftCardsSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = await userCan(user, 'settings.write');
  return <OnlineGiftCardsSettingsForm canEdit={canEdit} />;
}
