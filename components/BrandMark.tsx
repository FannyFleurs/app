'use client';

import { useEffect, useState } from 'react';

export interface Brand {
  brand_name: string;
  logo_url: string;
  favicon_url?: string;
  ca_logo_url?: string;
  ca_favicon_url?: string;
  bo_logo_url?: string;
  bo_favicon_url?: string;
  admin_logo_url?: string;
  admin_favicon_url?: string;
  pda_logo_url?: string;
  pda_favicon_url?: string;
  login_image_url?: string;
  plan_essentiel_price?: string;
  plan_croissance_price?: string;
  plan_reseau_price?: string;
}

const CACHE_KEY = 'webpos_brand_cache';
let cached: Brand | null = null;

// Amorce le cache depuis localStorage AVANT le 1er rendu : après une
// première visite, le logo correct s'affiche immédiatement (plus de flash
// du monogramme le temps du fetch réseau).
if (typeof window !== 'undefined' && !cached) {
  try {
    const s = window.localStorage.getItem(CACHE_KEY);
    if (s) cached = JSON.parse(s) as Brand;
  } catch { /* ignore */ }
}

/** Hook partagé : charge le branding public (nom + logo) une fois. */
export function useBrand(): Brand {
  const [brand, setBrand] = useState<Brand>(cached ?? { brand_name: 'HelloPos', logo_url: '' });
  useEffect(() => {
    // Même si on a un cache, on rafraîchit en arrière-plan (le logo peut
    // avoir changé). L'affichage reste stable car on part déjà du cache.
    void (async () => {
      try {
        const r = await fetch('/api/brand', { cache: 'no-store' });
        if (r.ok) {
          const j = (await r.json()) as Brand;
          cached = j;
          try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch { /* quota */ }
          setBrand(j);
        }
      } catch { /* garde le défaut / cache */ }
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
        // Hauteur fixe, largeur automatique : un logo « wordmark » reste
        // lisible (au lieu d'être écrasé dans un carré).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo_url}
          alt={name}
          style={{ height: size, maxWidth: size * 4.5 }}
          className="w-auto object-contain object-left shrink-0"
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
