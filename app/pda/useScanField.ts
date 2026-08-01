'use client';

import { useCallback, useRef } from 'react';
import type React from 'react';

/**
 * Champ de scan robuste pour le PDA (entrée multiple, inventaire…).
 *
 * Un seul chemin de validation (`commit`) : on lit la valeur RÉELLE du champ au
 * moment de valider, on la vide immédiatement, puis on traite le code. Évite les
 * courses entre le debounce et la touche Entrée (bug « le scan se comptait sur
 * l'article précédent »).
 *
 * Déclencheurs de validation :
 *   - touche Entrée (suffixe standard des douchettes) ;
 *   - retour/tab injecté dans la valeur (douchettes « paste ») ;
 *   - repli anti-rebond (120 ms sans nouvelle frappe) pour les douchettes sans
 *     suffixe.
 *
 * `onScan` est stocké dans une ref → la validation utilise toujours la dernière
 * version (pas de closure figée).
 */
export function useScanField(onScan: (code: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  // Empêche une double-validation du même scan (Entrée + debounce quasi simultanés).
  const lastAt = useRef(0);

  const commit = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const el = ref.current;
    if (!el) return;
    // On coupe à un éventuel retour/tab et on retire les espaces.
    const code = el.value.replace(/[\r\n\t].*$/s, '').trim();
    el.value = '';
    if (!code) return;
    const now = Date.now();
    if (now - lastAt.current < 40) return; // anti double-validation
    lastAt.current = now;
    onScanRef.current(code);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  }, [commit]);

  const onInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (/[\r\n\t]/.test(v)) { commit(); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, 120);
  }, [commit]);

  const refocus = useCallback(() => ref.current?.focus(), []);

  return { scanRef: ref, onKeyDown, onInput, refocus };
}
