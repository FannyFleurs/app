'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AdminNav from './AdminNav';
import AdminLogoutButton from './AdminLogoutButton';

function BrandLogo({ logoUrl, brandName, className }: { logoUrl: string | null; brandName: string; className?: string }) {
  // Uniquement le logo configuré : pas de monogramme « H » de repli.
  if (!logoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt={brandName} className={className ?? 'h-9 w-auto max-w-[150px] object-contain'} />;
}

export default function AdminShell({
  brandName,
  logoUrl,
  fullName,
  children,
}: {
  brandName: string;
  logoUrl: string | null;
  fullName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Referme le tiroir à chaque navigation (mobile).
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div className="min-h-screen bg-bg md:flex">
      {/* Barre supérieure mobile — hamburger + logo. */}
      <header className="md:hidden sticky top-0 z-30 h-14 flex items-center gap-3 border-b border-border bg-white px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir le menu"
          className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-gray-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link href="/admin" className="flex items-center gap-2">
          <BrandLogo logoUrl={logoUrl} brandName={brandName} className="h-8 w-auto max-w-[130px] object-contain" />
          <span className="text-sm font-semibold tracking-tight text-ink-soft">Admin</span>
        </Link>
      </header>

      {/* Voile sombre derrière le tiroir (mobile). */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — statique en desktop, tiroir coulissant en mobile. */}
      <aside
        className={`fixed md:sticky inset-y-0 left-0 top-0 z-50 h-screen w-64 md:w-60 shrink-0 border-r border-border bg-white flex flex-col transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-border">
          <Link href="/admin" className="flex items-center gap-2.5">
            <BrandLogo logoUrl={logoUrl} brandName={brandName} />
            <span className="text-sm font-semibold tracking-tight text-ink-soft">Admin</span>
          </Link>
          {/* Fermeture du tiroir (mobile). */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="md:hidden grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-gray-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <AdminNav />
        </div>

        <div className="border-t border-border p-3">
          <div className="px-3 pb-2 text-xs text-ink-soft truncate">{fullName}</div>
          <AdminLogoutButton />
        </div>
      </aside>

      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
