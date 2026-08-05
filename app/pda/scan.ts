'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';

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
 *  3. le code est lu sur TOUS les canaux possibles (frappes clavier ET valeur
 *     du champ), car selon son réglage une douchette n'utilise pas le même ;
 *  4. le champ est vidé à chaque validation, sans quoi le code suivant se
 *     colle au précédent.
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

/* -------------------------------------------------------------------------- */
/*  Champ de scan tolérant au mode de la douchette                             */
/* -------------------------------------------------------------------------- */

/** Caractères que les douchettes emploient comme fin de code. */
const TERMINATORS = /[\r\n\t]/;

/** Délai d'inactivité après lequel un code déjà complet est validé seul (ms). */
const IDLE_FLUSH_MS = 140;

/** Vitesse au-delà de laquelle la saisie ne peut venir que d'une machine. */
const MACHINE_MS_PER_CHAR = 35;

/** Deux validations du même code à moins de ce délai : la seconde est un écho. */
const ECHO_WINDOW_MS = 250;

/** Ressemble à un code-barres / une référence, par opposition à une recherche. */
export function looksLikeCode(s: string): boolean {
  const v = s.trim();
  if (v.length < 6) return false;
  if (/^\d{6,}$/.test(v)) return true;                 // EAN, UPC, code interne
  return /^[A-Z0-9][A-Z0-9._\-/]{5,}$/.test(v);        // référence en majuscules
}

export interface ScanFieldApi {
  inputRef: React.RefObject<HTMLInputElement>;
  /** À étaler sur l'`<input>`. */
  bind: {
    onInput: (e: React.FormEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
  clear: () => void;
  focus: () => void;
}

/**
 * Champ de scan compatible avec TOUTES les configurations de douchette.
 *
 * Selon le modèle et le réglage du terminal, un scan arrive par des chemins
 * très différents, et une implémentation qui n'en couvre qu'un seul « rate »
 * les scans en silence :
 *
 *  - frappes clavier caractère par caractère, puis Entrée (douchette USB / HID) ;
 *  - injection directe dans le champ actif, sans frappe exploitable — cas des
 *    terminaux Android en mode « clavier logiciel » : le code n'existe que dans
 *    la valeur du champ ;
 *  - code suivi d'un retour chariot ou d'une tabulation contenus dans la valeur ;
 *  - aucun terminateur du tout.
 *
 * On lit donc les DEUX sources (tampon de frappes et valeur du champ), on
 * accepte les trois terminateurs, et à défaut on valide sur inactivité — mais
 * seulement si le texte est reconnu comme un code, pour ne jamais transformer
 * une recherche par nom en scan.
 *
 * Le champ est vidé à CHAQUE validation : c'est ce qui empêchait le code
 * suivant de se coller au précédent.
 */
export function useScanField({ onCode, onSearch, canResolve, enabled = true }: {
  onCode: (code: string) => void;
  onSearch?: (value: string) => void;
  /** Vrai si le code est reconnaissable : autorise la validation automatique. */
  canResolve?: (code: string) => boolean;
  enabled?: boolean;
}): ScanFieldApi {
  const inputRef = useRef<HTMLInputElement>(null);

  const onCodeRef = useRef(onCode);       onCodeRef.current = onCode;
  const onSearchRef = useRef(onSearch);   onSearchRef.current = onSearch;
  const canResolveRef = useRef(canResolve); canResolveRef.current = canResolve;

  const bufferRef = useRef<ScanBuffer | null>(null);
  if (bufferRef.current === null) bufferRef.current = createScanBuffer();

  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const burstStartRef = useRef(0);

  const cancelIdle = useCallback(() => {
    if (idleRef.current) { clearTimeout(idleRef.current); idleRef.current = null; }
  }, []);

  const clear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    bufferRef.current!.reset();
    burstStartRef.current = 0;
    cancelIdle();
    onSearchRef.current?.('');
  }, [cancelIdle]);

  const focus = useCallback(() => {
    // Ne vole pas le focus à un bouton que l'on vient de toucher.
    const a = document.activeElement as HTMLElement | null;
    if (!a || a.tagName === 'BODY' || a === inputRef.current) inputRef.current?.focus();
  }, []);

  /** Valide un code : dédoublonne les échos, vide le champ, prévient l'écran. */
  const emit = useCallback((raw: string) => {
    const code = raw.trim();
    if (code.length < MIN_CODE_LENGTH) return;
    const now = Date.now();
    // Le même code peut arriver par deux canaux (frappes + valeur du champ) :
    // on n'en garde qu'une occurrence. 250 ms est très inférieur au temps
    // physique entre deux gâchettes, un double scan volontaire passe donc.
    if (code === lastEmitRef.current.code && now - lastEmitRef.current.at < ECHO_WINDOW_MS) {
      clear();
      return;
    }
    lastEmitRef.current = { code, at: now };
    clear();
    onCodeRef.current(code);
    // Le champ doit rester prêt pour le scan suivant, sans intervention.
    setTimeout(focus, 0);
  }, [clear, focus]);

  /* --- Canal 1 : frappes clavier, y compris champ non focalisé --- */
  useEffect(() => {
    if (!enabled) { bufferRef.current!.reset(); return; }
    const buffer = bufferRef.current!;

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Tabulation : terminateur courant sur les douchettes, jamais une
      // navigation utile dans cette application.
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const fromKeys = buffer.peek().trim();
        buffer.reset();
        emit(fromKeys || inputRef.current?.value || '');
        return;
      }
      buffer.push(e.key, Date.now());
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      buffer.reset();
    };
  }, [enabled, emit]);

  /* --- Canal 2 : contenu du champ (injection directe, sans frappe) --- */
  const onInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    if (!enabled) return;
    const value = (e.target as HTMLInputElement).value;

    // Terminateur contenu dans la valeur : tout ce qui précède est le code.
    const cut = value.search(TERMINATORS);
    if (cut >= 0) { emit(value.slice(0, cut)); return; }

    onSearchRef.current?.(value);

    const now = Date.now();
    if (value.length <= 1) burstStartRef.current = now;
    cancelIdle();
    if (value.length < MIN_CODE_LENGTH) return;

    // Validation sur inactivité : réservée à une saisie à vitesse machine ET
    // à un texte qui ressemble à un code (ou reconnu par le catalogue). Une
    // recherche tapée à la main n'est jamais validée toute seule.
    const perChar = (now - burstStartRef.current) / Math.max(1, value.length - 1);
    const machine = burstStartRef.current > 0 && perChar <= MACHINE_MS_PER_CHAR;
    const resolvable = canResolveRef.current?.(value.trim()) ?? false;
    if (!machine && !resolvable) return;
    if (!resolvable && !looksLikeCode(value)) return;

    idleRef.current = setTimeout(() => {
      const v = inputRef.current?.value ?? '';
      if (v.trim()) emit(v);
    }, IDLE_FLUSH_MS);
  }, [enabled, emit, cancelIdle]);

  /* --- Le champ reste armé : sans focus, une douchette « clavier logiciel »
         n'écrit nulle part et le scan est perdu. --- */
  const onBlur = useCallback(() => {
    setTimeout(focus, 60);
  }, [focus]);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [enabled]);

  useEffect(() => () => cancelIdle(), [cancelIdle]);

  return { inputRef, bind: { onInput, onBlur }, clear, focus };
}
