/**
 * Boutique à laquelle un écran atelier est rattaché.
 *
 * L'écran est posé une fois dans l'atelier et n'en bouge plus : on choisit sa
 * boutique à l'installation, et il la retrouve à chaque allumage sans que
 * personne n'ait à la resaisir. Comme pour l'identifiant de poste (lib/device),
 * on écrit dans DEUX stockages : le localStorage peut être vidé entre deux
 * lancements d'une PWA iOS, alors qu'un cookie 1ʳᵉ partie survit.
 */
const KEY = 'webpos_screen_store_id';
const MAX_AGE = 60 * 60 * 24 * 365 * 5; // ~5 ans

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]!) : null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/** Boutique retenue, ou null si l'écran n'a pas encore été rattaché. */
export function readScreenStoreId(): string | null {
  if (typeof window === 'undefined') return null;
  const c = readCookie(KEY);
  if (c) return c;
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Rattache l'écran à une boutique, durablement. */
export function writeScreenStoreId(storeId: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, storeId); } catch { /* quota / navigation privée */ }
  writeCookie(KEY, storeId, MAX_AGE);
}

/** Détache l'écran — il redemandera sa boutique au prochain affichage. */
export function clearScreenStoreId(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  writeCookie(KEY, '', 0);
}
