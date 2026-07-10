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
    // Attention : '/caisse'.startsWith('/ca') est TRUE — on doit matcher le
    // segment /ca exactement (ou /ca/…), sinon la caisse hérite du favicon CA.
    const isCA =
      host.startsWith('ca.') || path === '/ca' || (path?.startsWith('/ca/') ?? false);

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
  // IMPORTANT : ne JAMAIS supprimer les <link> gérés par React/Next
  // (métadonnées) — cela provoque un crash de réconciliation
  // (removeChild sur un nœud disparu). On NE supprime rien : on met à
  // jour le href des icônes statiques existantes (icon-192, apple…) ET on
  // ajoute nos propres <link> en fin de <head>. Ainsi, quel que soit le
  // <link> retenu par le navigateur, il pointe vers la bonne image — sans
  // retrait de nœud, donc sans crash.
  const statics = document.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel="shortcut icon"]',
  );
  statics.forEach((el) => {
    if (el.id.startsWith('dyn-favicon')) return;
    if (el.href !== url) el.href = url;
    // Les tailles fixes peuvent primer selon le navigateur : on les neutralise.
    el.removeAttribute('sizes');
  });
  setOwnLink('dyn-favicon-icon', 'icon', url);
  setOwnLink('dyn-favicon-apple', 'apple-touch-icon', url);
}

function setOwnLink(id: string, rel: string, url: string) {
  let el = document.getElementById(id) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.id = id;
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (el.href !== url) el.href = url;
}
