/**
 * Identifiant durable du poste (device) côté client.
 *
 * Un poste = une caisse (liaison register.device_id). Cet identifiant doit
 * SURVIVRE aux redémarrages « à froid » de l'app, y compris en PWA iOS
 * (écran d'accueil) où le localStorage peut être vidé/isolé entre deux
 * lancements. On le persiste donc dans DEUX stockages et on lit le premier
 * disponible :
 *   - un cookie 1ʳᵉ partie longue durée (plus robuste en PWA iOS),
 *   - le localStorage (compat historique).
 * Les deux sont toujours re-synchronisés, de sorte qu'un identifiant déjà
 * présent dans l'un restaure l'autre — le poste garde donc sa caisse.
 */
const KEY = 'webpos_device_id';
const MAX_AGE = 60 * 60 * 24 * 365 * 5; // ~5 ans

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]!) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * Renvoie l'identifiant du poste, en le créant au besoin. Idempotent :
 * appels multiples => même identifiant. Écrit dans cookie + localStorage.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id: string | null = null;
  try { id = localStorage.getItem(KEY); } catch { /* accès refusé */ }
  if (!id) id = readCookie(KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  // Re-synchronise systématiquement les deux stockages.
  try { localStorage.setItem(KEY, id); } catch { /* quota / privé */ }
  writeCookie(KEY, id);
  return id;
}

/** Lecture seule (sans création). Cookie prioritaire, puis localStorage. */
export function readDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  const c = readCookie(KEY);
  if (c) return c;
  try { return localStorage.getItem(KEY); } catch { return null; }
}
