'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Moteur de scan PDA.
 *
 * Cette version privilégie le mode Android « Input Box Mode » :
 * le lecteur écrit l'EAN complet dans le champ, puis envoie éventuellement
 * Enter. On ne reconstitue plus le code en mélangeant beforeinput, input,
 * keydown et polling : c'était la cause des codes incomplets ou instables.
 */

export interface Scannable {
  barcode?: string | null;
  sku?: string | null;
  extra_barcodes?: string[] | null;
}

export function normalizeCode(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

export function buildCodeIndex<T extends Scannable>(items: T[]): Map<string, T> {
  const index = new Map<string, T>();

  for (const item of items) {
    const add = (raw: string | null | undefined) => {
      if (!raw) return;
      const code = normalizeCode(raw);
      if (code && !index.has(code)) index.set(code, item);
    };

    add(item.barcode);
    add(item.sku);

    for (const barcode of item.extra_barcodes ?? []) {
      add(barcode);
    }
  }

  return index;
}

export function useCodeIndex<T extends Scannable>(items: T[]): Map<string, T> {
  return useMemo(() => buildCodeIndex(items), [items]);
}

export interface ScanBuffer {
  push(key: string, at: number): string | null;
  reset(): void;
  peek(): string;
}

export const MIN_CODE_LENGTH = 2;
export const SEQUENCE_GAP_MS = 1000;
export const QUIET_MS = 90;

export function createScanBuffer(): ScanBuffer {
  let buffer = '';
  let lastAt = 0;

  return {
    push(key, at) {
      if (key === 'Enter' || key === 'Tab') {
        const code = normalizeCode(buffer);
        buffer = '';
        lastAt = 0;
        return code.length >= MIN_CODE_LENGTH ? code : null;
      }

      if (key === 'Backspace') {
        buffer = buffer.slice(0, -1);
        return null;
      }

      if (key.length !== 1) return null;

      if (at - lastAt > SEQUENCE_GAP_MS) {
        buffer = '';
      }

      lastAt = at;
      buffer += key;
      return null;
    },

    reset() {
      buffer = '';
      lastAt = 0;
    },

    peek() {
      return buffer;
    },
  };
}

export function looksLikeCode(raw: string): boolean {
  const value = normalizeCode(raw);

  if (value.length < 6) return false;
  if (/^\d{6,}$/.test(value)) return true;

  return /^[a-z0-9][a-z0-9._\-/]{5,}$/i.test(value);
}

export interface WatchResult {
  code: string | null;
  changed: boolean;
}

export interface ValueWatcher {
  observe(value: string, at: number): WatchResult;
  reset(): void;
}

/**
 * Conservé pour les tests existants.
 * Le hook principal utilise désormais un debounce direct sur la valeur complète.
 */
export function createValueWatcher({
  isCode,
  quietMs = QUIET_MS,
}: {
  isCode: (value: string) => boolean;
  quietMs?: number;
}): ValueWatcher {
  let last = '';
  let changedAt = 0;

  return {
    observe(rawValue, at) {
      const value = normalizeCode(rawValue);

      if (value !== last) {
        last = value;
        changedAt = at;
        return { code: null, changed: true };
      }

      if (
        value.length >= MIN_CODE_LENGTH
        && at - changedAt >= quietMs
        && isCode(value)
      ) {
        last = '';
        changedAt = 0;
        return { code: value, changed: false };
      }

      return { code: null, changed: false };
    },

    reset() {
      last = '';
      changedAt = 0;
    },
  };
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
  lastField: string;
  lastKeys: string;
  lastInsert: string;
  dirtyBefore: number;
}

export interface ScanInfo {
  source: string;
  field: string;
  keys: string;
  dirty: boolean;
}

export interface ScanFieldApi {
  inputRef: React.RefObject<HTMLInputElement>;
  /**
   * Compatibilité avec le composant visuel existant.
   * Toujours 0 : le champ ne doit jamais être détruit/recréé.
   */
  generation: number;
  bind: {
    onPointerDown: () => void;
    onBlur: () => void;
  };
  armed: boolean;
  manual: boolean;
  clear: () => void;
  focus: () => void;
  stats: ScanStats;
}

const INPUT_DEBOUNCE_MS = 55;
const SILENT_POLL_MS = 80;
const SAME_EVENT_DEDUP_MS = 120;

export function useScanField({
  onCode,
  onSearch,
  canResolve,
  enabled = true,
}: {
  onCode: (code: string, info?: ScanInfo) => void;
  onSearch?: (value: string) => void;
  canResolve?: (code: string) => boolean;
  enabled?: boolean;
}): ScanFieldApi {
  const inputRef = useRef<HTMLInputElement>(null);

  const onCodeRef = useRef(onCode);
  const onSearchRef = useRef(onSearch);
  const canResolveRef = useRef(canResolve);

  onCodeRef.current = onCode;
  onSearchRef.current = onSearch;
  canResolveRef.current = canResolve;

  const [armed, setArmed] = useState(false);
  const [manual, setManual] = useState(false);

  const [stats, setStats] = useState<ScanStats>({
    keydown: 0,
    input: 0,
    valueChanges: 0,
    emitted: 0,
    lastKey: '',
    lastValue: '',
    lastCode: '',
    lastSource: '',
    lastField: '',
    lastKeys: '',
    lastInsert: '',
    dirtyBefore: 0,
  });

  const statsRef = useRef(stats);
  const keyBufferRef = useRef<ScanBuffer>(createScanBuffer());

  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastObservedValueRef = useRef('');
  const lastEmissionRef = useRef<{ code: string; at: number }>({
    code: '',
    at: 0,
  });

  const bumpStats = useCallback((patch: Partial<ScanStats>) => {
    statsRef.current = {
      ...statsRef.current,
      ...patch,
    };
  }, []);

  const cancelPending = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const clearInternal = useCallback(() => {
    cancelPending();

    const node = inputRef.current;
    if (node) node.value = '';

    lastObservedValueRef.current = '';
    keyBufferRef.current.reset();
    onSearchRef.current?.('');
  }, [cancelPending]);

  const focus = useCallback(() => {
    const node = inputRef.current;
    if (!node) return;

    try {
      node.focus({ preventScroll: true });
    } catch {
      node.focus();
    }
  }, []);

  const emit = useCallback((raw: string, source: string) => {
    const code = normalizeCode(raw);
    if (code.length < MIN_CODE_LENGTH) return;

    const now = Date.now();

    /*
     * Empêche uniquement le double traitement technique du même événement
     * (input puis Enter presque simultanés). Un vrai second scan du même article,
     * effectué normalement, reste accepté.
     */
    if (
      lastEmissionRef.current.code === code
      && now - lastEmissionRef.current.at < SAME_EVENT_DEDUP_MS
    ) {
      clearInternal();
      return;
    }

    const node = inputRef.current;
    const fieldValue = node?.value ?? '';
    const keys = keyBufferRef.current.peek();

    const normalizedField = normalizeCode(fieldValue);
    const dirty = normalizedField !== '' && normalizedField !== code;

    lastEmissionRef.current = { code, at: now };

    bumpStats({
      emitted: statsRef.current.emitted + 1,
      lastCode: code,
      lastSource: source,
      lastField: fieldValue,
      lastKeys: keys,
      lastInsert: fieldValue,
      dirtyBefore: statsRef.current.dirtyBefore + (dirty ? 1 : 0),
    });

    clearInternal();

    onCodeRef.current(code, {
      source,
      field: fieldValue,
      keys,
      dirty,
    });

    requestAnimationFrame(() => {
      focus();
    });
  }, [bumpStats, clearInternal, focus]);

  const scheduleFieldRead = useCallback((source: string) => {
    cancelPending();

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;

      const node = inputRef.current;
      if (!node) return;

      const raw = node.value;
      const code = normalizeCode(raw);

      if (code.length < MIN_CODE_LENGTH) return;

      const resolvable = canResolveRef.current?.(code) ?? false;

      /*
       * Un EAN ou une référence structurée est validé.
       * Une simple recherche textuelle reste affichée sans être exécutée.
       */
      if (resolvable || looksLikeCode(code)) {
        emit(code, source);
      }
    }, INPUT_DEBOUNCE_MS);
  }, [cancelPending, emit]);

  useEffect(() => {
    if (!enabled) {
      cancelPending();
      keyBufferRef.current.reset();
      return;
    }

    const blockTerminator = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'Tab') return false;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      bumpStats({
        keydown: statsRef.current.keydown + 1,
        lastKey: event.key,
      });

      if (event.key === 'Enter' || event.key === 'Tab') {
        blockTerminator(event);
        cancelPending();

        /*
         * En Input Box Mode, la valeur du champ est la source prioritaire.
         * Le tampon clavier n'est qu'un repli pour Keyboard Simulate Mode.
         */
        const fromField = normalizeCode(inputRef.current?.value ?? '');
        const fromKeys = normalizeCode(keyBufferRef.current.peek());

        keyBufferRef.current.reset();

        const code = fromField || fromKeys;
        if (code) {
          emit(code, fromField ? 'champ-enter' : 'touches-enter');
        }

        return;
      }

      keyBufferRef.current.push(event.key, Date.now());
    };

    const onKeyPress = (event: KeyboardEvent) => {
      blockTerminator(event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      blockTerminator(event);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keypress', onKeyPress, true);
    window.addEventListener('keyup', onKeyUp, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keypress', onKeyPress, true);
      window.removeEventListener('keyup', onKeyUp, true);
      keyBufferRef.current.reset();
    };
  }, [enabled, bumpStats, cancelPending, emit]);

  useEffect(() => {
    if (!enabled) return;

    const element = inputRef.current;
    if (!element) return;

    const onInput = () => {
      const raw = element.value;

      bumpStats({
        input: statsRef.current.input + 1,
        lastValue: raw,
        lastInsert: raw,
      });

      lastObservedValueRef.current = raw;
      onSearchRef.current?.(raw);

      /*
       * On attend quelques millisecondes que le PDA ait fini de remplacer
       * entièrement la valeur. On ne lit jamais InputEvent.data.
       */
      scheduleFieldRead('champ-input');
    };

    const onCompositionEnd = () => {
      scheduleFieldRead('champ-composition');
    };

    const onPaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.getData('text') ?? '';
      if (!pasted) return;

      event.preventDefault();
      element.value = pasted;

      bumpStats({
        input: statsRef.current.input + 1,
        lastValue: pasted,
        lastInsert: pasted,
      });

      lastObservedValueRef.current = pasted;
      onSearchRef.current?.(pasted);
      scheduleFieldRead('champ-collage');
    };

    element.addEventListener('input', onInput);
    element.addEventListener('compositionend', onCompositionEnd);
    element.addEventListener('paste', onPaste);

    focus();

    /*
     * Repli pour les lecteurs qui modifient directement input.value
     * sans émettre d'événement input.
     */
    const pollId = window.setInterval(() => {
      if (document.hidden) return;

      const node = inputRef.current;
      if (!node) return;

      const focused = document.activeElement === node;
      setArmed(focused);

      if (!focused) {
        const active = document.activeElement as HTMLElement | null;
        const editingAnotherField = Boolean(
          active
          && active !== node
          && (
            active.tagName === 'INPUT'
            || active.tagName === 'TEXTAREA'
            || active.isContentEditable
          ),
        );

        if (!editingAnotherField) focus();
      }

      if (node.value !== lastObservedValueRef.current) {
        lastObservedValueRef.current = node.value;

        bumpStats({
          valueChanges: statsRef.current.valueChanges + 1,
          lastValue: node.value,
          lastInsert: node.value,
        });

        onSearchRef.current?.(node.value);
        scheduleFieldRead('champ-polling');
      }

      setStats({ ...statsRef.current });
    }, SILENT_POLL_MS);

    return () => {
      window.clearInterval(pollId);
      cancelPending();
      element.removeEventListener('input', onInput);
      element.removeEventListener('compositionend', onCompositionEnd);
      element.removeEventListener('paste', onPaste);
    };
  }, [enabled, bumpStats, cancelPending, focus, scheduleFieldRead]);

  const onPointerDown = useCallback(() => {
    setManual(true);
  }, []);

  const onBlur = useCallback(() => {
    setArmed(false);
  }, []);

  const clear = useCallback(() => {
    setManual(false);
    clearInternal();

    requestAnimationFrame(() => {
      focus();
    });
  }, [clearInternal, focus]);

  return {
    inputRef,
    generation: 0,
    bind: {
      onPointerDown,
      onBlur,
    },
    armed,
    manual,
    clear,
    focus,
    stats,
  };
}
