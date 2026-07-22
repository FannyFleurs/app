import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readSessionFromCookie } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { mergePlatformDefaults, type PlatformSettings } from '@/lib/settings/platform';
import AdminShell from './AdminShell';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

// PWA admin : manifest dédié (start_url /) pour que l'icône « écran d'accueil »
// n'ouvre pas /caisse (404 sur admin.). Icône = favicon/logo admin.
export const metadata: Metadata = {
  title: 'Admin HelloPos',
  applicationName: 'Admin',
  manifest: '/manifest-admin.json',
  icons: {
    icon: [{ url: '/api/brand/icon?scope=admin' }, { url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/api/brand/icon?scope=admin' }],
  },
  appleWebApp: { capable: true, title: 'Admin', statusBarStyle: 'black-translucent' },
};

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
    <AdminShell brandName={brandName} logoUrl={brand.admin_logo_url || brand.logo_url || null} fullName={user.fullName}>
      {children}
    </AdminShell>
  );
}
