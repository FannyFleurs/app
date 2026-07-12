import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import AdminLogoutButton from './AdminLogoutButton';

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
    <div className="min-h-screen bg-white">
      {/* Topbar admin — fond clair, texte sombre (pas de vert). */}
      <header className="sticky top-0 z-30 h-16 bg-white text-ink border-b border-border flex items-center px-4">
        <Link href="/admin" className="flex items-center gap-2.5">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={brandName} className="h-10 w-auto max-w-[170px] object-contain" />
          ) : (
            <span className="grid h-10 w-10 place-items-center rounded-xl accent-bar text-white font-semibold">
              {brandName.charAt(0)}
            </span>
          )}
          <span className="text-sm font-semibold tracking-tight text-ink-soft hidden sm:inline">Admin SaaS</span>
        </Link>
        <nav className="ml-8 flex items-center gap-1">
          <AdminLink href="/admin">Dashboard</AdminLink>
          <AdminLink href="/admin/organizations">Organisations</AdminLink>
          <AdminLink href="/admin/promo-codes">Codes</AdminLink>
          <AdminLink href="/admin/configuration">Configuration</AdminLink>
          <AdminLink href="/admin/health">Santé</AdminLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-ink-soft">
          <span className="hidden sm:inline">{user.fullName}</span>
          <AdminLogoutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-lg text-sm font-medium text-ink-soft hover:bg-gray-100 hover:text-ink transition-colors">
      {children}
    </Link>
  );
}
