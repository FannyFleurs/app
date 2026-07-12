import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import AdminLogoutButton from './AdminLogoutButton';
import AdminNav from './AdminNav';

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
            Cette zone est réservée aux opérateurs HelloPos (rôle super_admin).
          </p>
          <Link href="/caisse" className="btn-primary mt-4 inline-flex">Retour caisse</Link>
        </div>
      </main>
    );
  }

  // Branding (logo + nom) depuis la config plateforme.
  let brand: PlatformSettings = mergePlatformDefaults(null);
  try {
    const { rows } = await query<{ value: Partial<PlatformSettings> }>(
      `SELECT value FROM platform_settings WHERE id = 1`,
    );
    brand = mergePlatformDefaults(rows[0]?.value ?? null);
  } catch { /* migration 0029 absente */ }
  const brandName = brand.brand_name || 'HelloPos';

  return (
    <div className="min-h-screen bg-white flex">
      {/* Sidebar admin — fond clair, texte sombre (pas de vert). */}
      <aside className="sticky top-0 h-screen w-60 shrink-0 border-r border-border bg-white flex flex-col">
        <div className="h-16 flex items-center px-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2.5">
            {brand.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logo_url} alt={brandName} className="h-9 w-auto max-w-[150px] object-contain" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-xl accent-bar text-white font-semibold">
                {brandName.charAt(0)}
              </span>
            )}
            <span className="text-sm font-semibold tracking-tight text-ink-soft">Admin SaaS</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <AdminNav />
        </div>

        <div className="border-t border-border p-3">
          <div className="px-3 pb-2 text-xs text-ink-soft truncate">{user.fullName}</div>
          <AdminLogoutButton />
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
