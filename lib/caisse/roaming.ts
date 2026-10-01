/**
 * Poste itinérant (`pos.roaming_device`) : choix de caisse mémorisé en LOCAL
 * SEULEMENT (cet appareil), jamais en base — contrairement à la liaison
 * permanente (`registers.device_id`), ce choix ne lie jamais l'appareil et
 * se change librement, sans intervention d'un admin. Partagé entre
 * `CashRegister` (lecture/écriture au choix de caisse) et `AllPagesOverlay`
 * (bouton « Changer de boutique », accessible depuis toutes les pages).
 */

export interface RoamingChoice {
  storeId: string;
  registerId: string;
}

const ROAMING_KEY = 'webpos_roaming_register';

export function readRoamingChoice(): RoamingChoice | null {
  try {
    const raw = localStorage.getItem(ROAMING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { storeId?: string; registerId?: string };
    if (v.storeId && v.registerId) return { storeId: v.storeId, registerId: v.registerId };
  } catch { /* stockage indisponible */ }
  return null;
}

export function writeRoamingChoice(storeId: string, registerId: string): void {
  try { localStorage.setItem(ROAMING_KEY, JSON.stringify({ storeId, registerId })); } catch { /* quota */ }
}

export function clearRoamingChoice(): void {
  try { localStorage.removeItem(ROAMING_KEY); } catch { /* stockage indisponible */ }
}
