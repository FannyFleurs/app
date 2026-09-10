/**
 * Échelle de l'interface, réglée PAR APPAREIL (cet écran), pas au niveau
 * organisation : chaque poste a un écran différent, et le confort de lecture
 * dépend de sa taille. On mémorise donc le facteur en localStorage et on
 * l'applique en `zoom` sur `<html>`.
 *
 * `zoom` sur la racine agit comme un zoom navigateur : TOUT est mis à l'échelle
 * d'un coup (police, sidebar, boutons, panier) et les unités de viewport
 * (`100dvh` de la caisse) continuent de remplir l'écran visible — contrairement
 * à un `transform: scale()` qui laisserait la boîte de mise en page inchangée.
 *
 * Volontairement sans dépendance React : lisible depuis l'AppShell (qui
 * applique) comme depuis la page de réglages (qui écrit).
 */

export const UI_SCALE_KEY = 'webpos_ui_scale';
export const UI_SCALE_MIN = 1;
export const UI_SCALE_MAX = 2;
export const UI_SCALE_STEP = 0.1;
export const UI_SCALE_DEFAULT = 1;
/** Événement diffusé au changement, pour appliquer en direct sans recharger. */
export const UI_SCALE_EVENT = 'webpos:ui_scale';

/** Borne au [MIN, MAX] et arrondit au pas de 0,1 (évite 1.30000000001). */
export function clampScale(v: number): number {
  if (!Number.isFinite(v)) return UI_SCALE_DEFAULT;
  const stepped = Math.round(v * 10) / 10;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped));
}

/** Lit l'échelle enregistrée pour cet appareil (défaut = 1). Sûr côté client. */
export function readUiScale(): number {
  try {
    const raw = localStorage.getItem(UI_SCALE_KEY);
    if (raw == null) return UI_SCALE_DEFAULT;
    return clampScale(Number(raw));
  } catch {
    return UI_SCALE_DEFAULT;
  }
}

/** Applique l'échelle au document. `1` retire l'attribut (rendu natif). */
export function applyUiScale(scale: number): void {
  try {
    const s = clampScale(scale);
    const el = document.documentElement;
    // `setProperty('zoom', …)` : `zoom` n'est pas typé sur CSSStyleDeclaration.
    if (s === UI_SCALE_DEFAULT) el.style.removeProperty('zoom');
    else el.style.setProperty('zoom', String(s));
  } catch {
    /* pas de DOM (SSR) : rien à faire */
  }
}

/**
 * Enregistre l'échelle pour cet appareil, l'applique et prévient l'AppShell
 * (événement) pour un rendu immédiat. Renvoie la valeur effectivement retenue.
 */
export function setUiScale(scale: number): number {
  const s = clampScale(scale);
  try {
    if (s === UI_SCALE_DEFAULT) localStorage.removeItem(UI_SCALE_KEY);
    else localStorage.setItem(UI_SCALE_KEY, String(s));
  } catch {
    /* stockage indisponible : on applique quand même pour la session */
  }
  applyUiScale(s);
  try {
    window.dispatchEvent(new CustomEvent(UI_SCALE_EVENT, { detail: s }));
  } catch {
    /* pas de window */
  }
  return s;
}
