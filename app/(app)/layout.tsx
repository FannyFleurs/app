import { redirect } from 'next/navigation';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import {
  mergeWithDefaults,
  POS_UI_KEY,
  type PosUiSettings,
} from '@/lib/settings/pos-ui';
import AppShell from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');

  const { rows } = await query<{ value: Partial<PosUiSettings> }>(
    `SELECT value FROM settings WHERE organization_id = $1 AND key = $2`,
    [user.organizationId, POS_UI_KEY],
  );
  const ui = mergeWithDefaults(rows[0]?.value ?? null);

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, role: user.role, email: user.email }}
      themeColor={ui.theme_color}
      colorScheme={ui.color_scheme}
      hiddenPaths={ui.hidden_sidebar_paths ?? []}
      autoLogoutMode={ui.auto_logout_mode}
      autoLogoutMinutes={ui.auto_logout_minutes}
    >
      {children}
    </AppShell>
  );
}
