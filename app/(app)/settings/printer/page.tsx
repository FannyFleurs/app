import { readSessionFromCookie } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/rbac';
import PrinterSettingsForm from './PrinterSettingsForm';

export const dynamic = 'force-dynamic';

export default async function PrinterSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!hasPermission(user.role, 'settings.read')) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canWrite = hasPermission(user.role, 'settings.write');
  return <PrinterSettingsForm canWrite={canWrite} />;
}
