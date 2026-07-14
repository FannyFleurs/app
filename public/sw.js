/* Service worker HelloPos — résilience hors-ligne de la caisse.
 *
 * Stratégie : NETWORK-FIRST partout (donc, EN LIGNE, on sert toujours la
 * version fraîche → aucun risque de servir un vieux chunk après un déploiement).
 * On ne se rabat sur le cache QUE si le réseau échoue (hors-ligne). On ne met
 * en cache que le nécessaire pour faire tourner la caisse : documents de
 * navigation, assets Next/_next, icônes, et quelques API « catalogue » en GET.
 */
const VERSION = 'v2';
const CACHE = 'webpos-' + VERSION;

// API en lecture, sûres à mettre en cache (pas de données sensibles cross-user).
const CATALOG = [
  /^\/api\/products/,
  /^\/api\/categories/,
  /^\/api\/tax-rates/,
  /^\/api\/settings\/pos/,
  /^\/api\/brand/,
];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('webpos-') && k !== CACHE).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  // Jamais l'auth ni les mutations : on laisse le navigateur gérer.
  if (url.pathname.startsWith('/api/auth')) return;

  const isNavigation = req.mode === 'navigate';
  // Assets immuables (chunks hashés Next, icônes) : cache-first → chargement
  // à chaud instantané, aucune attente réseau en ligne. Sûr car le nom de
  // fichier change à chaque build.
  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.ico';
  const isAsset =
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/manifest');
  const isCatalog = CATALOG.some((re) => re.test(url.pathname));

  if (isImmutable) { event.respondWith(cacheFirst(req)); return; }
  if (!(isNavigation || isAsset || isCatalog)) return; // le reste : comportement normal

  event.respondWith(networkFirst(req, isNavigation));
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') {
    cache.put(req, res.clone()).catch(() => {});
  }
  return res;
});

async function networkFirst(req, isNavigation) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // On ne met en cache que les réponses complètes et OK.
    if (res && res.status === 200 && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (isNavigation) {
      const fallback = (await cache.match('/caisse')) || (await cache.match('/'));
      if (fallback) return fallback;
    }
    throw err;
  }
}
