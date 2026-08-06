/**
 * Mode école : activable depuis "Toutes les pages".
 * Quand actif, aucune opération de la caisse n'est envoyée au serveur ;
 * tout est stocké en localStorage avec le préfixe webpos_school_*.
 * Au passage en mode normal, toutes ces clés sont supprimées.
 */

import { useEffect, useState } from 'react';

const FLAG_KEY = 'webpos_school_mode';
const PREFIX = 'webpos_school_';

export function isSchoolModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(FLAG_KEY) === '1';
}

/** Active le mode école et notifie l'app via un custom event. */
export function activateSchoolMode(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FLAG_KEY, '1');
  window.dispatchEvent(new CustomEvent('webpos:school-mode-changed', {
    detail: { active: true },
  }));
}

/** Désactive le mode école ET supprime toutes les données locales. */
export function deactivateSchoolMode(): void {
  if (typeof window === 'undefined') return;
  // Purge toutes les clés préfixées webpos_school_ (sauf le flag lui-même
  // qu'on supprime en dernier).
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) toDelete.push(k);
  }
  for (const k of toDelete) localStorage.removeItem(k);
  localStorage.removeItem(FLAG_KEY);
  window.dispatchEvent(new CustomEvent('webpos:school-mode-changed', {
    detail: { active: false },
  }));
}

/** Hook React : retourne l'état du mode école, mis à jour automatiquement. */
export function useSchoolMode(): boolean {
  const [active, setActive] = useState<boolean>(false);
  useEffect(() => {
    setActive(isSchoolModeActive());
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setActive(!!detail?.active);
    }
    window.addEventListener('webpos:school-mode-changed', onChange);
    return () => window.removeEventListener('webpos:school-mode-changed', onChange);
  }, []);
  return active;
}

/**
 * Fiche client créée pendant une démonstration.
 *
 * Le mode école doit pouvoir dérouler une vente de bout en bout, client
 * compris. Enregistrer ce client pour de vrai polluerait le fichier de la
 * boutique : on le garde donc en local, aux côtés du reste de la démo, et il
 * disparaît avec elle. Les vrais clients, eux, restent sélectionnables — on ne
 * fait que les lire.
 */
export interface SchoolCustomer {
  id: string;
  display_name: string;
  type: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  default_discount_pct: number | null;
}

const CUSTOMERS_KEY = 'customers';

/** Un identifiant de démonstration se reconnaît à l'œil : rien à demander au serveur. */
export function isSchoolCustomerId(id: string): boolean {
  return id.startsWith('school-');
}

export function schoolCustomers(): SchoolCustomer[] {
  return schoolStore.get<SchoolCustomer[]>(CUSTOMERS_KEY, []);
}

export function addSchoolCustomer(c: Omit<SchoolCustomer, 'id'>): SchoolCustomer {
  const created: SchoolCustomer = { ...c, id: `school-cust-${Date.now()}` };
  schoolStore.set(CUSTOMERS_KEY, [created, ...schoolCustomers()]);
  return created;
}

/** Stockage local générique scoped au mode école. */
export const schoolStore = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* quota */ }
  },
  remove(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(PREFIX + key);
  },
};
