import { type RefObject, useCallback, useRef, useState } from 'react';

/**
 * A set held in state — what the player draws — beside a ref that always holds
 * its latest value, for the callbacks that read it between renders, and a
 * toggle that keeps one identity for the life of the player. Toggling a key to
 * where it already is changes nothing, so no render follows.
 */
export function useKeySet<T>(
  initial: () => ReadonlySet<T>,
): [ReadonlySet<T>, RefObject<ReadonlySet<T>>, (key: T, on: boolean) => void] {
  const [keys, setKeys] = useState<ReadonlySet<T>>(initial);
  const latest = useRef(keys);
  latest.current = keys;
  const toggle = useCallback((key: T, on: boolean) => {
    setKeys((previous) => {
      if (previous.has(key) === on) {
        return previous;
      }
      const next = new Set(previous);
      if (on) {
        next.add(key);
      } else {
        next.delete(key);
      }
      latest.current = next;
      return next;
    });
  }, []);
  return [keys, latest, toggle];
}

/**
 * A map held in state, with a setter that keeps one identity: `undefined`
 * removes the key, and setting a value it already has changes nothing.
 */
export function useKeyMap<K, V>(): [ReadonlyMap<K, V>, (key: K, value: V | undefined) => void] {
  const [entries, setEntries] = useState<ReadonlyMap<K, V>>(() => new Map());
  const set = useCallback((key: K, value: V | undefined) => {
    setEntries((previous) => {
      if (previous.get(key) === value) {
        return previous;
      }
      const next = new Map(previous);
      if (value === undefined) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }, []);
  return [entries, set];
}
