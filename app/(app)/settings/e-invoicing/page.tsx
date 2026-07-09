import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import {
  EINVOICING_KEY,
  mergeEInvoicingDefaults,
  maskKey,
  type EInvoicingSettings,
} from '@/lib/settings/einvoicing';
import EInvoicingForm from './EInvoicingForm';

export const dynamic = 'force-dynamic';

export default async function EInvoicingSettingsPage() {
  const user = (await readSessionFromCookie())!;
  if (!(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const { rows } = await query<{ value: Partial<EInvoicingSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, EINVOICING_KEY],
  );
  const merged = mergeEInvoicingDefaults(rows[0]?.value ?? null);
  const canEdit = await userCan(user, 'settings.write');

  return (
    <EInvoicingForm
      initial={{
        ...merged,
        pdp_api_key: '',
        pdp_api_key_masked: maskKey(merged.pdp_api_key),
        pdp_api_key_set: !!merged.pdp_api_key,
      }}
      canEdit={canEdit}
    />
  );
}
