import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import Sidebar from '@/components/Sidebar';
import LogoutButton from '@/components/LogoutButton';
import { ROLE_LABELS } from '@/components/labels';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr]">
      <aside className="border-r border-border bg-surface/60 backdrop-blur-sm">
        <div className="px-4 py-5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-sage text-white font-semibold">F</div>
            <div>
              <div className="font-semibold leading-tight">Florea POS</div>
              <div className="text-xs text-ink-soft">Back-office</div>
            </div>
          </Link>
        </div>
        <Sidebar role={user.role} />
        <div className="absolute bottom-0 left-0 w-[260px] border-t border-border bg-surface/80 px-4 py-3">
          <div className="text-sm font-medium truncate">{user.fullName}</div>
          <div className="text-xs text-ink-soft">{ROLE_LABELS[user.role]}</div>
          <LogoutButton />
        </div>
      </aside>
      <main className="overflow-auto">{children}</main>
    </div>
  );
}
