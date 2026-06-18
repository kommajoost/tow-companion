import { useCallback, useEffect, useReducer } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// One shared store per key so every usePersistentState(key) instance sees the same value and
// re-renders together — needed so e.g. a background list-sync can update `tow:lists` and the
// builder UI updates immediately (not just on remount). Also picks up cross-tab `storage` events.
interface Store<T> { value: T; subs: Set<() => void> }
const stores = new Map<string, Store<unknown>>();

function getStore<T>(key: string, initial: T): Store<T> {
  let s = stores.get(key) as Store<T> | undefined;
  if (!s) {
    s = { value: read(key, initial), subs: new Set() };
    stores.set(key, s as Store<unknown>);
  }
  return s;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    const s = stores.get(e.key);
    if (!s) return;
    s.value = read(e.key, s.value);
    s.subs.forEach((cb) => cb());
  });
}

/** Write a key's value programmatically (outside React), notifying every hook bound to it. */
export function setPersisted<T>(key: string, value: T): void {
  const s = getStore(key, value);
  s.value = value;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full/unavailable */ }
  s.subs.forEach((cb) => cb());
}

/** Read a key's current value (outside React). */
export function getPersisted<T>(key: string, fallback: T): T {
  return getStore(key, fallback).value;
}

/** useState that mirrors its value to localStorage under `key` and stays in sync across every
 *  component using the same key (and across browser tabs). */
export function usePersistentState<T>(key: string, initial: T) {
  const store = getStore(key, initial);
  const [, force] = useReducer((c) => c + 1, 0);

  useEffect(() => {
    const cb = () => force();
    store.subs.add(cb);
    return () => { store.subs.delete(cb); };
  }, [store]);

  const setValue = useCallback((updater: T | ((prev: T) => T)) => {
    const next = typeof updater === 'function' ? (updater as (prev: T) => T)(store.value) : updater;
    store.value = next;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage full/unavailable */ }
    store.subs.forEach((cb) => cb());
  }, [key, store]);

  return [store.value, setValue] as const;
}
