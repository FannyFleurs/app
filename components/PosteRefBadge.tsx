'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { posteRef } from '@/lib/poste-ref';

/**
 * Petit badge fixe en bas à droite affichant la référence du poste
 * (caisse liée à cet appareil). Visible en caisse et dans les
 * paramètres, pour que l'opérateur puisse la communiquer au support
 * (qui la retrouve dans la console admin > Postes actifs).
 */
export default function PosteRefBadge() {
  const path = usePathname();
  const [ref, setRef] = useState<string | null>(null);
  const [store, setStore] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dev = localStorage.getItem('webpos_device_id');
    if (!dev) return;
    void (async () => {
      const r = await fetch(`/api/registers/mine?device_id=${encodeURIComponent(dev)}`);
      if (r.ok) {
        const j = await r.json();
        if (j.register) {
          setRef(posteRef(j.register.id));
          setStore(`${j.register.store_name} · ${j.register.name}`);
        }
      }
    })();
  }, []);

  // Uniquement en caisse et dans les paramètres.
  const show = path === '/caisse' || path.startsWith('/settings');
  if (!show || !ref) return null;

  return (
    <div className="fixed bottom-2 right-2 z-30 pointer-events-none select-none">
      <div className="rounded-lg bg-ink/80 text-white/90 text-[10px] leading-tight px-2 py-1 shadow-sm">
        <span className="font-mono font-semibold">{ref}</span>
        {store && <span className="ml-1.5 opacity-70">{store}</span>}
      </div>
    </div>
  );
}
