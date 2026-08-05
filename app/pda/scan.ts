'use client';

import { useEffect, useMemo, useRef } from 'react';

/**
 * Moteur de scan du PDA — point d'entrée UNIQUE de toute l'application.
 *
 * Historique du bug qu'il corrige : chaque écran résolvait un code scanné en
 * regardant sa liste filtrée (« s'il ne reste qu'un seul résultat, c'est
 * celui-là »). Or la douchette écrit dans le champ de recherche : au moment
 * où la touche Entrée arrive, l'état React de la recherche a un cycle de
 * retard. La liste « filtrée » contenait donc encore le résultat du scan
 * PRÉCÉDENT — d'où « je scanne B, ça compte sur A », y compris après être
 * sorti puis revenu sur l'écran.
 *
 * Règles appliquées ici, et jamais contournées ailleurs :
 *  1. un code scanné n'est résolu que par CORRESPONDANCE EXACTE, via un index
 *     construit une fois pour toutes — jamais via une liste filtrée ;
 *  2. le gestionnaire est lu dans une ref à chaque frappe : il ne peut pas
 *     être périmé ;
 *  3. la capture est globale (window, phase capture) et fonctionne que le
 *     focus soit dans un champ ou nulle part.
 */

/** Tout objet portant des codes reconnaissables par la douchette. */
export interface Scannable {
  barcode?: string | null;
  sku?: string | null;
  extra_barcodes?: string[] | null;
}

/** Normalisation d'un code : casse et espaces uniquement. */
export function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Index code → objet. Un même article peut avoir plusieurs codes (EAN
 * principal, codes additionnels, référence interne).
 */
export function buildCodeIndex<T extends Scannable>(items: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) {
    const add = (c: string | null | undefined) => {
      if (!c) return;
      const k = normalizeCode(c);
      // Premier arrivé, premier servi : un doublon de code ne doit pas
      // silencieusement remplacer l'article déjà indexé.
      if (k && !m.has(k)) m.set(k, it);
    };
    add(it.barcode);
    add(it.sku);
    for (const b of it.extra_barcodes ?? []) add(b);
  }
  return m;
}

/** Index mémoïsé, reconstruit uniquement quand la liste change. */
export function useCodeIndex<T extends Scannable>(items: T[]): Map<string, T> {
  return useMemo(() => buildCodeIndex(items), [items]);
}

/**
 * Machine à états du tampon de frappes, isolée du DOM pour être testable.
 *
 * La douchette « tape » le code caractère par caractère puis envoie Entrée.
 * `push` renvoie le code complet au moment de la validation, `null` sinon.
 */
export interface ScanBuffer {
  push(key: string, at: number): string | null;
  reset(): void;
  /** Contenu courant — exposé pour les tests uniquement. */
  peek(): string;
}

/** Longueur minimale d'un code accepté (évite les Entrée parasites). */
export const MIN_CODE_LENGTH = 2;

/** Au-delà de cette pause (ms), la frappe suivante démarre un nouveau code. */
export const SEQUENCE_GAP_MS = 1000;

export function createScanBuffer(): ScanBuffer {
  let buf = '';
  let last = 0;
  return {
    push(key, at) {
      if (key === 'Enter') {
        const code = buf.trim();
        buf = '';
        return code.length >= MIN_CODE_LENGTH ? code : null;
      }
      if (key === 'Backspace') {
        buf = buf.slice(0, -1);
        return null;
      }
      // Touches d'édition / navigation : sans effet sur le tampon.
      if (key.length !== 1) return null;
      // Une pause longue marque le début d'une nouvelle séquence : deux scans
      // successifs ne peuvent jamais se coller.
      if (at - last > SEQUENCE_GAP_MS) buf = '';
      last = at;
      buf += key;
      return null;
    },
    reset() { buf = ''; },
    peek() { return buf; },
  };
}

/**
 * Capture globale des frappes de la douchette.
 *
 * `onCode` est appelé avec le code complet à la validation (Entrée). Le
 * gestionnaire passé peut changer à chaque rendu : il est relu dans une ref,
 * donc toujours à jour.
 *
 * `enabled` permet à un écran de rendre la main (ex. : une modale par-dessus
 * prend le scan à son compte). Le tampon est vidé à la désactivation, de sorte
 * qu'aucun reliquat d'un scan précédent ne puisse ressortir plus tard.
 */
export function useScanner(onCode: (code: string) => void, enabled = true): void {
  const handlerRef = useRef(onCode);
  handlerRef.current = onCode;

  const bufferRef = useRef<ScanBuffer | null>(null);
  if (bufferRef.current === null) bufferRef.current = createScanBuffer();

  useEffect(() => {
    const buffer = bufferRef.current!;
    if (!enabled) { buffer.reset(); return; }

    function onKeyDown(e: KeyboardEvent) {
      // Raccourcis système : on ne les considère jamais comme un scan.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const code = buffer.push(e.key, Date.now());
      if (code !== null) {
        // Empêche le champ de soumettre une seconde fois le même code.
        e.preventDefault();
        handlerRef.current(code);
      }
    }

    // Phase capture : on voit la frappe avant tout gestionnaire de champ.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      buffer.reset();
    };
  }, [enabled]);
}
