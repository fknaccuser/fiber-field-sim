/**
 * UI-only state that must outlive a viewport's React subtree: camera poses, OTDR settings
 * and cursors, terminal drafts. Heavy viewports (WebGL/canvas) are truly unmounted when
 * switched away from so their GPU resources are released; their *state* lives here instead,
 * so remounting restores exactly where the user left off. Never holds session data.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react';

const slots = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

export function readViewportState<T>(key: string): T | undefined {
  return slots.get(key) as T | undefined;
}

export function writeViewportState<T>(key: string, value: T): void {
  slots.set(key, value);
  emit(key);
}

/** Drop everything -- call when a different session starts so no viewport carries stale state across scenarios. */
export function clearViewportState(): void {
  const keys = [...slots.keys()];
  slots.clear();
  for (const key of keys) emit(key);
}

export function useViewportState<T>(key: string, initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    if (!slots.has(key)) {
      const init = initialRef.current;
      slots.set(key, typeof init === 'function' ? (init as () => T)() : init);
    }
    return slots.get(key) as T;
  }, [key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = slots.get(key) as T;
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      if (Object.is(resolved, prev)) return;
      slots.set(key, resolved);
      emit(key);
    },
    [key],
  );

  return [value, set];
}
