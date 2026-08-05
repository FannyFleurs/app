'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

export function normalizeCode(raw: string): string {
  return String(raw ?? '')
    // Retire les caractères de contrôle : Enter, Tab, CR/LF, caractères invisibles.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    // Retire les espaces classiques, insécables et caractères Unicode invisibles.
    .replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .toLowerCase();
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
/*  Surveillance de la VALEUR du champ                                         */
/* -------------------------------------------------------------------------- */

/** Caractères que les douchettes emploient comme fin de code. */
const TERMINATORS = /[\r\n\t]/;

/** Silence après lequel une valeur stable est considérée comme un code complet. */
export const QUIET_MS = 180;

/** Ressemble à un code-barres / une référence, par opposition à une recherche. */
export function looksLikeCode(s: string): boolean {
  const v = s.trim();
  if (v.length < 6) return false;
  if (/^\d{6,}$/.test(v)) return true;                 // EAN, UPC, code interne
  return /^[A-Z0-9][A-Z0-9._\-/]{5,}$/.test(v);        // référence en majuscules
}

export interface WatchResult {
  /** Code complet à traiter, ou null. */
  code: string | null;
  /** La valeur a changé depuis la dernière observation. */
  changed: boolean;
}

export interface ValueWatcher {
  observe(value: string, at: number): WatchResult;
  reset(): void;
}

/**
 * Détecte un code complet à partir des seules VALEURS successives du champ.
 *
 * C'est le cœur de la fiabilité du scan : peu importe comment le texte est
 * arrivé — frappes clavier, événements `input`, ou écriture directe dans le
 * DOM par le lecteur intégré du terminal, cas où AUCUN événement n'est émis et
 * où toute approche événementielle échoue en silence.
 *
 * Deux déclencheurs :
 *  - un terminateur (retour chariot / tabulation) contenu dans la valeur ;
 *  - une valeur stable depuis `quietMs`, à condition qu'elle soit reconnue
 *    comme un code : une recherche par nom n'est jamais validée toute seule.
 */
export function createValueWatcher({ isCode, quietMs = QUIET_MS }: {
  isCode: (value: string) => boolean;
  quietMs?: number;
}): ValueWatcher {
  let last = '';
  let since = 0;
  return {
    observe(value, at) {
      const cut = value.search(TERMINATORS);
      if (cut >= 0) {
        last = ''; since = at;
        const code = value.slice(0, cut).trim();
        return { code: code.length >= MIN_CODE_LENGTH ? code : null, changed: true };
      }
      if (value !== last) {
        last = value; since = at;
        return { code: null, changed: true };
      }
      const v = value.trim();
      if (v.length >= MIN_CODE_LENGTH && at - since >= quietMs && isCode(v)) {
        last = ''; since = at;
        return { code: v, changed: false };
      }
      return { code: null, changed: false };
    },
    reset() { last = ''; since = 0; },
  };
}

/* -------------------------------------------------------------------------- */
/*  Champ de scan                                                              */
/* -------------------------------------------------------------------------- */

/** Période d'observation de la valeur du champ (ms). */
const POLL_MS = 60;

export interface ScanFieldApi {
  inputRef: React.RefObject<HTMLInputElement>;
  /** Change à chaque scan : sert de clé React pour recréer l'élément. */
  generation: number;
  bind: {
    onPointerDown: () => void;
    onBlur: () => void;
  };
  /** Le champ a le focus : le lecteur intégré peut y écrire. */
  armed: boolean;
  /** L'utilisateur a demandé le clavier (saisie manuelle). */
  manual: boolean;
  clear: () => void;
  focus: () => void;
  /** Compteurs bruts, pour l'écran de diagnostic. */
  stats: ScanStats;
}

export interface ScanStats {
  keydown: number;
  input: number;
  valueChanges: number;
  emitted: number;
  lastKey: string;
  lastValue: string;
  lastCode: string;
  lastSource: string;
  /** Contenu BRUT du champ au moment de la validation. */
  lastField: string;
  /** Contenu du tampon de frappes au moment de la validation. */
  lastKeys: string;
  /** Texte inséré reconstitué (canal `beforeinput`). */
  lastInsert: string;
  /** Nombre de fois où le champ n'était pas vide juste avant un scan. */
  dirtyBefore: number;
}

/** Détail transmis à l'écran de diagnostic à chaque code validé. */
export interface ScanInfo {
  source: string;
  field: string;
  keys: string;
  dirty: boolean;
}

/**
 * Champ de scan.
 *
 * Trois canaux, cumulés, parce qu'aucun n'est universel :
 *
 *  1. `keydown` sur la fenêtre — douchette USB/HID qui « tape » le code,
 *     fonctionne même sans focus dans le champ ;
 *  2. événements `input` du champ — lecteur intégré passant par le clavier
 *     logiciel ;
 *  3. **observation périodique de la valeur du champ** — seul canal qui
 *     fonctionne quand le lecteur écrit directement dans le DOM sans émettre
 *     le moindre événement.
 *
 * Le champ est vidé après CHAQUE validation, et un même code arrivant par deux
 * canaux n'est traité qu'une fois.
 *
 * Le focus ne peut pas être garanti : sur mobile, `focus()` appelé hors d'une
 * interaction utilisateur est ignoré par le navigateur. `armed` expose donc
 * l'état réel, à charge pour l'écran d'inviter à toucher le champ.
 */
export function useScanField({ onCode, onSearch, canResolve, enabled = true }: {
  onCode: (code: string, info?: ScanInfo) => void;
  onSearch?: (value: string) => void;
  canResolve?: (code: string) => boolean;
  enabled?: boolean;
}): ScanFieldApi {
  const inputRef = useRef<HTMLInputElement>(null);

  const onCodeRef = useRef(onCode);         onCodeRef.current = onCode;
  const onSearchRef = useRef(onSearch);     onSearchRef.current = onSearch;
  const canResolveRef = useRef(canResolve); canResolveRef.current = canResolve;

  // Compteur de « génération » du champ : il sert de clé React. À chaque
  // validation, l'élément <input> est DÉTRUIT puis recréé. Un élément neuf
  // n'a ni valeur, ni tampon de composition du clavier système, ni historique
  // de saisie — c'est la seule garantie absolue qu'aucun code précédent ne
  // puisse être relu.
  const [generation, setGeneration] = useState(0);
  const [armed, setArmed] = useState(false);
  const [manual, setManual] = useState(false);
  const manualRef = useRef(false);
  const [stats, setStats] = useState<ScanStats>({
    keydown: 0, input: 0, valueChanges: 0, emitted: 0,
    lastKey: '', lastValue: '', lastCode: '', lastSource: '',
    lastField: '', lastKeys: '', lastInsert: '', dirtyBefore: 0,
  });
  const statsRef = useRef(stats);
  // Les compteurs ne passent PAS par un état React : une mise à jour d'état à
  // chaque frappe re-rend le champ pendant la saisie, ce qui perturbe le
  // clavier système Android. Ils sont accumulés en ref et publiés à part.
  const bumpStats = useCallback((patch: Partial<ScanStats>) => {
    statsRef.current = { ...statsRef.current, ...patch };
  }, []);

  // Texte RÉELLEMENT inséré à ce scan, reconstitué depuis InputEvent.data.
  // C'est le seul canal qui décrit ce qui vient d'arriver, indépendamment du
  // contenu du champ : un terminal qui conserve l'ancienne valeur ne peut donc
  // plus faire relire un code déjà traité.
  const insertRef = useRef('');
  const insertAtRef = useRef(0);
  const lastInsertChunkRef = useRef<{ data: string; at: number }>({ data: '', at: 0 });

  const keyBufferRef = useRef<ScanBuffer | null>(null);
  if (keyBufferRef.current === null) keyBufferRef.current = createScanBuffer();

  const watcherRef = useRef<ValueWatcher | null>(null);
  if (watcherRef.current === null) {
    watcherRef.current = createValueWatcher({
      // Un code reconnu par le catalogue est toujours accepté ; sinon il doit
      // ressembler à un code. Une recherche par nom ne remplit ni l'une ni
      // l'autre condition et n'est donc jamais validée toute seule — y compris
      // en saisie manuelle, où le mode ne sert qu'à ouvrir le clavier.
      isCode: (v) => (canResolveRef.current?.(v) ?? false) || looksLikeCode(v),
    });
  }

  // Code validé en dernier, et activité (frappe / événement input) survenue
  // depuis. Sert à distinguer une VRAIE relecture d'un article d'une simple
  // réinjection du champ par le clavier système.
  const lastCodeRef = useRef('');
  const activityRef = useRef(0);

  /**
   * Vide le champ pour de bon.
   *
   * Sur Android, écrire `value = ''` PENDANT un événement clavier est souvent
   * annulé : le clavier système re-applique aussitôt son tampon de composition,
   * et le champ retrouve le code précédent. La touche Entrée suivante relit
   * alors l'ancien code — l'article scanné n'apparaît jamais, et c'est le
   * précédent qui est recompté.
   *
   * On vide donc trois fois : tout de suite, au tour de boucle suivant, puis
   * une dernière fois après un cycle complet de rendu ; et on force le clavier
   * à lâcher sa composition par un blur/focus.
   */
  const clear = useCallback(() => {
    const el = inputRef.current;
    if (el) el.value = '';
    insertRef.current = '';
    lastInsertChunkRef.current = { data: '', at: 0 };
    keyBufferRef.current!.reset();
    watcherRef.current!.reset();
    onSearchRef.current?.('');
    if (!el) return;
    // Les vidages différés sont CONDITIONNELS : ils n'effacent que le vide ou
    // le code déjà traité. Sans cette garde, un scan arrivant dans l'intervalle
    // serait effacé avant d'avoir pu être lu.
    const wipeIfStale = () => {
      const node = inputRef.current;
      if (!node) return false;
      const v = node.value.trim();
      if (v !== '' && v !== lastCodeRef.current) return false;
      node.value = '';
      return true;
    };
    setTimeout(() => {
      if (!wipeIfStale()) return;
      // blur/focus : seule manière fiable de faire lâcher au clavier système
      // sa composition en cours, sinon il réécrit ce qu'il croit être saisi.
      if (document.activeElement === inputRef.current) {
        inputRef.current?.blur();
        inputRef.current?.focus({ preventScroll: true });
      }
      wipeIfStale();
    }, 0);
    setTimeout(wipeIfStale, 80);
  }, []);

  const focus = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const emit = useCallback((raw: string, source: string) => {
    const code = raw.trim();
    if (code.length < MIN_CODE_LENGTH) return;
    // Pas de dédoublonnage par le temps : scanner DEUX FOIS le même article
    // est le geste normal pour en compter deux. La protection contre le double
    // traitement d'un même scan est structurelle — `clear()` vide À LA FOIS le
    // champ et le tampon de frappes, donc le second canal n'a plus rien à lire.
    const fieldValue = inputRef.current?.value ?? '';
    const keys = keyBufferRef.current!.peek();
    const dirty = fieldValue.trim() !== '' && fieldValue.trim() !== code;

    lastCodeRef.current = code;
    activityRef.current = 0;
    clear();
    // Recrée l'élément de saisie : aucun résidu possible.
    setGeneration((g) => g + 1);
    bumpStats({
      emitted: statsRef.current.emitted + 1,
      lastCode: code,
      lastSource: source,
      lastField: fieldValue,
      lastKeys: keys,
      dirtyBefore: statsRef.current.dirtyBefore + (dirty ? 1 : 0),
    });
    onCodeRef.current(code, { source, field: fieldValue, keys, dirty });
  }, [clear, bumpStats]);

  /* --- Canal 1 : frappes clavier, y compris hors du champ --- */
  useEffect(() => {
    if (!enabled) {
      keyBufferRef.current!.reset();
      return;
    }

    const buffer = keyBufferRef.current!;

    function isTerminator(e: KeyboardEvent) {
      return e.key === 'Enter' || e.key === 'Tab';
    }

    function blockTerminator(e: KeyboardEvent) {
      if (!isTerminator(e)) return false;

      // Le suffixe envoyé par la douchette ne doit jamais continuer vers
      // l'interface. Sinon Android/Chrome peut activer le bouton actuellement
      // ciblé et ouvrir la fiche article après avoir correctement scanné.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return true;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      activityRef.current++;
      bumpStats({ keydown: statsRef.current.keydown + 1, lastKey: e.key });

      if (isTerminator(e)) {
        blockTerminator(e);

        // Ordre de confiance : texte réellement inséré, frappes reçues, puis
        // valeur du champ uniquement en dernier recours.
        const fromInsert = insertRef.current.trim();
        const fromKeys = buffer.peek().trim();
        const fromField = inputRef.current?.value?.trim() ?? '';

        buffer.reset();
        insertRef.current = '';

        const raw = fromInsert || fromKeys || fromField;
        if (raw) {
          emit(raw, fromInsert ? 'insertion' : fromKeys ? 'touches' : 'champ');
        }
        return;
      }

      buffer.push(e.key, Date.now());
    }

    function onKeyPress(e: KeyboardEvent) {
      // Certains WebView déclenchent encore l'action par keypress.
      blockTerminator(e);
    }

    function onKeyUp(e: KeyboardEvent) {
      // Certains boutons sont activés au relâchement de la touche.
      blockTerminator(e);
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keypress', onKeyPress, true);
    window.addEventListener('keyup', onKeyUp, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keypress', onKeyPress, true);
      window.removeEventListener('keyup', onKeyUp, true);
      buffer.reset();
    };
  }, [enabled, emit, bumpStats]);

  /* --- Canaux 2 et 3 : événements d'insertion ET observation de la valeur ---
     Dépend de `generation` : l'élément étant recréé après chaque scan, les
     écouteurs doivent être rattachés au NOUVEL élément — sinon ils restent sur
     un nœud détaché et le canal d'insertion devient muet dès le second scan. */
  useEffect(() => {
    if (!enabled) return;
    const el = inputRef.current;
    if (!el) return;

    /**
     * Certains PDA Android n'émettent pas `beforeinput`, mais fournissent le
     * code neuf dans `InputEvent.data` sur l'événement `input`. C'était le trou
     * principal de l'ancienne implémentation : l'événement était compté mais
     * son contenu était ignoré, puis Enter relisait `input.value` encore égal
     * au code précédent.
     */
    const appendFreshData = (data: string | null | undefined, inputType = '') => {
      if (inputType.startsWith('delete')) {
        insertRef.current = insertRef.current.slice(0, -1);
        return;
      }
      if (!data) return;
      const now = Date.now();

      // Chrome peut exposer la même insertion sur `beforeinput` puis `input`.
      // On ne conserve qu'un exemplaire du même fragment dans une fenêtre très
      // courte, sans empêcher deux vrais scans identiques successifs.
      const previous = lastInsertChunkRef.current;
      if (previous.data === data && now - previous.at < 25) return;
      lastInsertChunkRef.current = { data, at: now };

      if (now - insertAtRef.current > SEQUENCE_GAP_MS) insertRef.current = '';
      insertAtRef.current = now;
      insertRef.current += data;
      activityRef.current++;
      bumpStats({ lastInsert: insertRef.current });

      const cut = insertRef.current.search(TERMINATORS);
      if (cut >= 0) {
        const code = insertRef.current.slice(0, cut);
        insertRef.current = '';
        emit(code, 'insertion');
      }
    };

    const onInput = (ev: Event) => {
      const e = ev as InputEvent;
      activityRef.current++;
      bumpStats({ input: statsRef.current.input + 1 });

      // Sur beaucoup de WebView Android, le code complet est disponible ici
      // en une seule fois, même lorsque la valeur visible du champ est périmée.
      appendFreshData(e.data, e.inputType ?? '');
    };

    /**
     * `beforeinput` / `input` portent, dans `data`, le texte inséré par CETTE
     * frappe — et lui seul. On le cumule pour reconstituer le code du scan en
     * cours, sans jamais dépendre de la valeur du champ.
     */
    function onInsert(ev: Event) {
      const e = ev as InputEvent;
      appendFreshData(e.data, e.inputType ?? '');
    }

    // Certains lecteurs utilisent l'IME Android et terminent leur saisie via
    // un événement de composition. `compositionend.data` contient alors le
    // nouveau code, indépendamment de la valeur résiduelle du champ.
    function onCompositionEnd(ev: CompositionEvent) {
      appendFreshData(ev.data, 'insertCompositionText');
    }

    // D'autres terminaux sont configurés en mode presse-papiers/collage.
    function onPaste(ev: ClipboardEvent) {
      const data = ev.clipboardData?.getData('text') ?? '';
      if (!data) return;
      ev.preventDefault();
      appendFreshData(data, 'insertFromPaste');
    }

    el.addEventListener('input', onInput);
    el.addEventListener('beforeinput', onInsert);
    el.addEventListener('compositionend', onCompositionEnd);
    el.addEventListener('paste', onPaste);

    // Tentative de focus initial : souvent refusée par le navigateur hors
    // interaction, d'où l'indicateur `armed` et l'invite à toucher le champ.
    el.focus({ preventScroll: true });

    const id = setInterval(() => {
      if (document.hidden) return;
      const node = inputRef.current;
      if (!node) return;

      const isFocused = document.activeElement === node;
      setArmed(isFocused);
      // Le navigateur accepte parfois un focus tardif (retour d'arrière-plan,
      // fermeture d'une modale) : on retente, sans jamais voler le focus à un
      // autre champ de saisie.
      if (!isFocused) {
        const a = document.activeElement as HTMLElement | null;
        const editing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
        if (!editing) node.focus({ preventScroll: true });
      }

      // Le champ a retrouvé le code déjà validé sans qu'aucune frappe ni
      // aucun événement ne soit survenu : c'est le clavier système qui l'a
      // réinjecté, pas un nouveau scan. On efface sans rien recompter.
      if (node.value.trim() && node.value.trim() === lastCodeRef.current && activityRef.current === 0) {
        node.value = '';
        watcherRef.current!.reset();
        return;
      }

      setStats(statsRef.current);
      const res = watcherRef.current!.observe(node.value, Date.now());
      if (res.changed) {
        bumpStats({
          valueChanges: statsRef.current.valueChanges + 1,
          lastValue: node.value,
        });
        onSearchRef.current?.(node.value);
      }
      if (res.code) emit(insertRef.current.trim() || res.code, insertRef.current.trim() ? 'insertion' : 'valeur');
    }, POLL_MS);

    return () => {
      clearInterval(id);
      el.removeEventListener('input', onInput);
      el.removeEventListener('beforeinput', onInsert);
      el.removeEventListener('compositionend', onCompositionEnd);
      el.removeEventListener('paste', onPaste);
      watcherRef.current!.reset();
    };
  }, [enabled, emit, bumpStats, generation]);

  // Le champ vient d'être recréé : on lui redonne le focus immédiatement,
  // sinon le lecteur intégré n'aurait plus de cible.
  useEffect(() => {
    if (!enabled || generation === 0) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [generation, enabled]);

  const onPointerDown = useCallback(() => {
    // Toucher le champ = intention de saisie manuelle : on autorise le clavier
    // logiciel et on suspend la validation automatique par ressemblance.
    manualRef.current = true;
    setManual(true);
  }, []);

  const onBlur = useCallback(() => setArmed(false), []);

  return {
    inputRef,
    generation,
    bind: { onPointerDown, onBlur },
    armed,
    manual,
    clear: useCallback(() => { manualRef.current = false; setManual(false); clear(); }, [clear]),
    focus,
    stats,
  };
}
