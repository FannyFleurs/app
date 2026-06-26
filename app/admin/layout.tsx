import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await readSessionFromCookie();
  if (!user) redirect('/login');
  if (user.role !== 'super_admin') {
    return (
      <main className="h-screen grid place-items-center bg-white p-6">
        <div className="card max-w-md w-full p-6 text-center">
          <div className="text-warning text-3xl mb-2">🔒</div>
          <h1 className="text-xl font-semibold">Accès réservé</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Cette zone est réservée aux opérateurs Webpos (rôle super_admin).
          </p>
          <Link href="/caisse" className="btn-primary mt-4 inline-flex">Retour caisse</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Topbar admin distincte de l'app */}
      <header className="sticky top-0 z-30 h-14 bg-ink text-white flex items-center px-4">
        <Link href="/admin" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 font-semibold">F</span>
          <span className="font-semibold tracking-tight">Webpos — Admin SaaS</span>
        </Link>
        <nav className="ml-8 flex items-center gap-1">
          <AdminLink href="/admin">Dashboard</AdminLink>
          <AdminLink href="/admin/organizations">Organisations</AdminLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-white/80">
          <span>{user.fullName}</span>
          <Link href="/caisse" className="text-xs text-white/60 hover:text-white">
            ↩ Mode boutique
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white transition-colors">
      {children}
    </Link>
  );
}
