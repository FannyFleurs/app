import { readSessionFromCookie } from '@/lib/auth/session';
import { userCan } from '@/lib/auth/permissions';
import { query } from '@/lib/db/client';
import { EXPORT_FORMATS_KEY, enabledOptionalFormats } from '@/lib/settings/export-formats';
import ExportFormatsForm from './ExportFormatsForm';

export const dynamic = 'force-dynamic';

/**
 * Réglage des formats d'export.
 *
 * L'écran d'export lui-même vit dans le back-office (Pilotage → Exports
 * comptables). Ici on décide seulement de ce qu'il propose : par défaut le
 * seul format qui sert, les autres sur demande.
 */
export default async function ExportFormatsSettingsPage() {
  const user = await readSessionFromCookie();
  if (!user || !(await userCan(user, 'settings.read'))) {
    return <div className="p-8">Accès refusé.</div>;
  }
  const canEdit = await userCan(user, 'settings.write');

  const { rows } = await query<{ value: unknown }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, EXPORT_FORMATS_KEY],
  );

  return (
    <ExportFormatsForm
      initial={enabledOptionalFormats(rows[0]?.value ?? null)}
      canEdit={canEdit}
    />
  );
}
