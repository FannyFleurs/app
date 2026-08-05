'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Moteur de scan du PDA — point d'entrée UNIQUE de toute l'application.
 *
 * Principes :
 *  1. résolution uniquement par correspondance exacte dans un index ;
 *  2. conservation permanente du même élément <input> ;
 *  3. lecture des frappes clavier, événements input/beforeinput,
 *     composition Android, collage et valeur du champ ;
 *  4. neutralisation complète de Enter/Tab pour éviter l'ouverture
 *     involontaire d'une fiche article ;
 *  5. nettoyage du champ sans blur ni recréation du DOM.
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
    const add = (value: string | null | undefined) => {
      if (!value) return;
      const code = normalizeCode(value);
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

export function createScanBuffer(): ScanBuffer {
  let buffer = '';
  let lastAt = 0;

  return {
    push(key, at) {
      if (key === 'Enter' || key === 'Tab') {
        const code = buffer.trim();
        buffer = '';
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

const TERMINATORS = /[\r\n\t]/;
export const QUIET_MS = 180;

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

export function createValueWatcher({
  isCode,
  quietMs = QUIET_MS,
}: {
  isCode: (value: string) => boolean;
  quietMs?: number;
}): ValueWatcher {
  let lastValue = '';
  let changedAt = 0;

  return {
    observe(value, at) {
      const terminatorIndex = value.search(TERMINATORS);

      if (terminatorIndex >= 0) {
        const code = normalizeCode(value.slice(0, terminatorIndex));
        lastValue = '';
        changedAt = at;

        return {
          code: code.length >= MIN_CODE_LENGTH ? code : null,
          changed: true,
        };
      }

      if (value !== lastValue) {
        lastValue = value;
        changedAt = at;
        return { code: null, changed: true };
      }

      const normalized = normalizeCode(value);

      if (
        normalized.length >= MIN_CODE_LENGTH
        && at - changedAt >= quietMs
        && isCode(normalized)
      ) {
        lastValue = '';
        changedAt = at;
        return { code: normalized, changed: false };
      }

      return { code: null, changed: false };
    },

    reset() {
      lastValue = '';
      changedAt = 0;
    },
  };
}

const POLL_MS = 60;

export interface ScanFieldApi {
  inputRef: React.RefObject<HTMLInputElement>;
  /**
   * Conservé pour compatibilité avec le composant ScanField.
   * La valeur reste toujours à 0 : le champ ne doit plus être recréé.
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

  const bumpStats = useCallback((patch: Partial<ScanStats>) => {
    statsRef.current = {
      ...statsRef.current,
      ...patch,
    };
  }, []);

  const insertRef = useRef('');
  const insertAtRef = useRef(0);
  const lastInsertChunkRef = useRef<{ data: string; at: number }>({
    data: '',
    at: 0,
  });

  const keyBufferRef = useRef<ScanBuffer | null>(null);
  if (keyBufferRef.current === null) {
    keyBufferRef.current = createScanBuffer();
  }

  const watcherRef = useRef<ValueWatcher | null>(null);
  if (watcherRef.current === null) {
    watcherRef.current = createValueWatcher({
      isCode: (value) => {
        const code = normalizeCode(value);
        return (canResolveRef.current?.(code) ?? false) || looksLikeCode(code);
      },
    });
  }

  const lastCodeRef = useRef('');
  const activityRef = useRef(0);

  /**
   * Nettoyage sans remplacement du champ, sans blur et sans recréation.
   * Le scanner garde donc toujours la même cible DOM.
   */
  const clearInternal = useCallback(() => {
    const node = inputRef.current;

    if (node) {
      node.value = '';
    }

    insertRef.current = '';
    insertAtRef.current = 0;
    lastInsertChunkRef.current = { data: '', at: 0 };
    keyBufferRef.current?.reset();
    watcherRef.current?.reset();
    activityRef.current = 0;

    onSearchRef.current?.('');
  }, []);

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

    const fieldValue = inputRef.current?.value ?? '';
    const keys = keyBufferRef.current?.peek() ?? '';
    const normalizedField = normalizeCode(fieldValue);

    const dirty = (
      normalizedField !== ''
      && normalizedField !== code
    );

    lastCodeRef.current = code;

    bumpStats({
      emitted: statsRef.current.emitted + 1,
      lastCode: code,
      lastSource: source,
      lastField: fieldValue,
      lastKeys: keys,
      dirtyBefore: statsRef.current.dirtyBefore + (dirty ? 1 : 0),
    });

    /*
     * On nettoie avant l'appel métier pour empêcher un second canal
     * de relire la même séquence.
     */
    clearInternal();

    onCodeRef.current(code, {
      source,
      field: fieldValue,
      keys,
      dirty,
    });

    /*
     * Le même champ reste monté. On lui redonne simplement le focus
     * au prochain frame, sans blur intermédiaire.
     */
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;

      node.value = '';

      try {
        node.focus({ preventScroll: true });
      } catch {
        node.focus();
      }
    });
  }, [bumpStats, clearInternal]);

  useEffect(() => {
    if (!enabled) {
      keyBufferRef.current?.reset();
      return;
    }

    const buffer = keyBufferRef.current!;

    const isTerminator = (event: KeyboardEvent) => (
      event.key === 'Enter'
      || event.key === 'Tab'
    );

    const blockTerminator = (event: KeyboardEvent) => {
      if (!isTerminator(event)) return false;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      return true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      activityRef.current += 1;

      bumpStats({
        keydown: statsRef.current.keydown + 1,
        lastKey: event.key,
      });

      if (isTerminator(event)) {
        blockTerminator(event);

        const fromInsert = normalizeCode(insertRef.current);
        const fromKeys = normalizeCode(buffer.peek());
        const fromField = normalizeCode(inputRef.current?.value ?? '');

        buffer.reset();
        insertRef.current = '';

        const code = fromInsert || fromKeys || fromField;

        if (code) {
          emit(
            code,
            fromInsert
              ? 'insertion'
              : fromKeys
                ? 'touches'
                : 'champ',
          );
        }

        return;
      }

      buffer.push(event.key, Date.now());
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
      buffer.reset();
    };
  }, [enabled, emit, bumpStats]);

  useEffect(() => {
    if (!enabled) return;

    const element = inputRef.current;
    if (!element) return;

    const appendFreshData = (
      data: string | null | undefined,
      inputType = '',
    ) => {
      if (inputType.startsWith('delete')) {
        insertRef.current = insertRef.current.slice(0, -1);
        return;
      }

      if (!data) return;

      const now = Date.now();
      const previous = lastInsertChunkRef.current;

      /*
       * Certains WebView envoient la même donnée dans beforeinput puis input.
       * Une fenêtre très courte empêche seulement ce doublon technique.
       */
      if (
        previous.data === data
        && now - previous.at < 25
      ) {
        return;
      }

      lastInsertChunkRef.current = { data, at: now };

      if (now - insertAtRef.current > SEQUENCE_GAP_MS) {
        insertRef.current = '';
      }

      insertAtRef.current = now;
      insertRef.current += data;
      activityRef.current += 1;

      bumpStats({
        lastInsert: insertRef.current,
      });

      const terminatorIndex = insertRef.current.search(TERMINATORS);

      if (terminatorIndex >= 0) {
        const code = insertRef.current.slice(0, terminatorIndex);
        insertRef.current = '';
        emit(code, 'insertion');
      }
    };

    const onBeforeInput = (event: Event) => {
      const inputEvent = event as InputEvent;
      appendFreshData(
        inputEvent.data,
        inputEvent.inputType ?? '',
      );
    };

    const onInput = (event: Event) => {
      const inputEvent = event as InputEvent;

      activityRef.current += 1;

      bumpStats({
        input: statsRef.current.input + 1,
      });

      appendFreshData(
        inputEvent.data,
        inputEvent.inputType ?? '',
      );
    };

    const onCompositionEnd = (event: CompositionEvent) => {
      appendFreshData(
        event.data,
        'insertCompositionText',
      );
    };

    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData?.getData('text') ?? '';
      if (!data) return;

      event.preventDefault();
      appendFreshData(data, 'insertFromPaste');
    };

    element.addEventListener('beforeinput', onBeforeInput);
    element.addEventListener('input', onInput);
    element.addEventListener('compositionend', onCompositionEnd);
    element.addEventListener('paste', onPaste);

    focus();

    const intervalId = window.setInterval(() => {
      if (document.hidden) return;

      const node = inputRef.current;
      if (!node) return;

      const focused = document.activeElement === node;
      setArmed(focused);

      /*
       * On ne vole pas le focus à un autre champ réellement utilisé.
       */
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

        if (!editingAnotherField) {
          focus();
        }
      }

      const currentValue = node.value;
      const normalizedValue = normalizeCode(currentValue);

      /*
       * Le clavier Android peut réinjecter l'ancien code sans nouvelle
       * activité. Dans ce cas, on l'efface mais on ne le recompte pas.
       */
      if (
        normalizedValue
        && normalizedValue === lastCodeRef.current
        && activityRef.current === 0
      ) {
        node.value = '';
        watcherRef.current?.reset();
        return;
      }

      setStats({ ...statsRef.current });

      const result = watcherRef.current!.observe(
        currentValue,
        Date.now(),
      );

      if (result.changed) {
        bumpStats({
          valueChanges: statsRef.current.valueChanges + 1,
          lastValue: currentValue,
        });

        onSearchRef.current?.(currentValue);
      }

      if (result.code) {
        const inserted = normalizeCode(insertRef.current);

        emit(
          inserted || result.code,
          inserted ? 'insertion' : 'valeur',
        );
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(intervalId);
      element.removeEventListener('beforeinput', onBeforeInput);
      element.removeEventListener('input', onInput);
      element.removeEventListener('compositionend', onCompositionEnd);
      element.removeEventListener('paste', onPaste);
      watcherRef.current?.reset();
    };
  }, [enabled, emit, bumpStats, focus]);

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
