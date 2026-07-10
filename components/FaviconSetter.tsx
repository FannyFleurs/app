'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Applique dynamiquement le favicon (onglet navigateur) selon le
 * contexte :
 *   - espace CA (ca. ou /ca)  -> ca_favicon_url, sinon ca_logo_url
 *   - reste de l'app          -> favicon_url, sinon logo_url
 * Le favicon peut être une URL externe ou une data URL (logo uploadé).
 */
export default function FaviconSetter() {
  const path = usePathname();

  useEffect(() => {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isCA = host.startsWith('ca.') || path?.startsWith('/ca');

    void (async () => {
      try {
        const r = await fetch('/api/brand', { cache: 'no-store' });
        if (!r.ok) return;
        const b = await r.json();
        const url = isCA
          ? (b.ca_favicon_url || b.ca_logo_url || b.favicon_url || b.logo_url)
          : (b.favicon_url || b.logo_url);
        if (!url) return;
        applyFavicon(url);
      } catch { /* garde le favicon par défaut */ }
    })();
  }, [path]);

  return null;
}

function applyFavicon(url: string) {
  // Supprime les icônes existantes déclarées statiquement puis pose la nôtre.
  const head = document.head;
  head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((el) => el.remove());

  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = url;
  head.appendChild(icon);

  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = url;
  head.appendChild(apple);
}
