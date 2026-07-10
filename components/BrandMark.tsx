'use client';

import { useEffect, useState } from 'react';

export interface Brand {
  brand_name: string;
  logo_url: string;
  favicon_url?: string;
  ca_logo_url?: string;
  ca_favicon_url?: string;
  plan_essentiel_price?: string;
  plan_croissance_price?: string;
}

let cached: Brand | null = null;

/** Hook partagé : charge le branding public (nom + logo) une fois. */
export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(cached ?? { brand_name: 'HelloPos', logo_url: '' });
  useEffect(() => {
    if (cached) { setBrand(cached); return; }
    void (async () => {
      try {
        const r = await fetch('/api/brand', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          cached = j;
          setBrand(j);
        }
      } catch { /* garde le défaut */ }
    })();
  }, []);
  return brand;
}

/**
 * Logo + nom de la marque. `size` = côté du carré logo en px.
 * Affiche le logo configuré, sinon le monogramme (1re lettre).
 */
export default function BrandMark({
  size = 44, showName = true, className = '',
}: { size?: number; showName?: boolean; className?: string }) {
  const brand = useBrand();
  const name = brand.brand_name || 'HelloPos';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {brand.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo_url}
          alt={name}
          style={{ height: size, width: size }}
          className="rounded-2xl object-contain shrink-0"
        />
      ) : (
        <span
          style={{ height: size, width: size }}
          className="grid place-items-center rounded-2xl accent-bar text-white font-semibold shrink-0"
        >
          {name.charAt(0)}
        </span>
      )}
      {showName && <span className="text-lg font-semibold tracking-tight">{name}</span>}
    </div>
  );
}
