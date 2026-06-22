import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
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

  const collapsed = cookies().get('florea_sidebar_collapsed')?.value === '1';

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, role: user.role, email: user.email }}
      themeColor={ui.theme_color}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
