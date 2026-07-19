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
    const cookies = typeof document !== 'undefined' ? document.cookie : '';
    // Attention : '/caisse'.startsWith('/ca') est TRUE — on doit matcher le
    // segment /ca exactement (ou /ca/…), sinon la caisse hérite du favicon CA.
    const isCA =
      host.startsWith('ca.') || path === '/ca' || (path?.startsWith('/ca/') ?? false);
    const isAdmin =
      host.startsWith('admin.') || path === '/admin' || (path?.startsWith('/admin/') ?? false);
    // Back-office : sous-domaine bo. OU cookie webpos_bo=1 (posé par /bo),
    // qui reste le signal fiable hors sous-domaine (dev, domaine unique).
    const isBO =
      host.startsWith('bo.') || /(?:^|;\s*)webpos_bo=1(?:;|$)/.test(cookies);
    const scope = isCA ? 'ca' : isAdmin ? 'admin' : isBO ? 'bo' : 'app';

    void (async () => {
      // On calcule un jeton de version basé sur l'image effective : l'URL du
      // favicon ne change QUE lorsque le logo change. Indispensable car les
      // navigateurs mettent le favicon en cache très agressivement par URL —
      // sans ce jeton, un ancien favicon resterait affiché indéfiniment.
      let v = '0';
      try {
        const r = await fetch('/api/brand', { cache: 'no-store' });
        if (r.ok) {
          const b = await r.json();
          const eff =
            scope === 'ca' ? (b.ca_favicon_url || b.ca_logo_url || b.favicon_url || b.logo_url || '')
            : scope === 'admin' ? (b.admin_favicon_url || b.favicon_url || b.logo_url || '')
            : scope === 'bo' ? (b.bo_favicon_url || b.favicon_url || b.logo_url || '')
            : (b.favicon_url || b.logo_url || '');
          v = hashStr(String(eff));
        }
      } catch { /* on garde v=0 : au pire, pas de cache-busting */ }

      // On pointe vers une VRAIE URL image (endpoint qui décode la data: URL),
      // car iOS Safari ignore les data: URLs pour le favicon / l'icône d'accueil.
      applyFavicon(`/api/brand/icon?scope=${scope}&v=${v}`);
    })();
  }, [path]);

  return null;
}

/** Petit hash déterministe (djb2) -> base36, pour un jeton de version court. */
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
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
