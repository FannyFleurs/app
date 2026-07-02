import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import PrinterSettingsForm from './PrinterSettingsForm';

export const dynamic = 'force-dynamic';

export default async function PrinterSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = (await userCan(user, 'settings.write'));
  return <PrinterSettingsForm canWrite={canWrite} />;
}
