import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePersistentState } from './store';
import { makeSyncKey, pullLists, pushLists, type CloudLists } from './lib/listSync';

// Keeps `tow:lists` in sync across a player's devices via a shared sync key (no login):
//  • on connect/open it pulls the cloud copy and adopts it if another device changed it,
//  • on every local change it pushes (debounced),
//  • last write wins (fine for a single player across their own devices).

type Status = 'off' | 'syncing' | 'synced' | 'error';

interface ListSyncValue {
  key: string | null;
  status: Status;
  lastSyncedAt: string | null;
  error: string | null;
  listCount: number;
  createKey: () => string;                              // generate a key + push local lists
  peek: (key: string) => Promise<CloudLists | null>;    // look at a key's cloud lists before deciding
  adoptCloud: (key: string, cloud: CloudLists) => void; // replace local lists with the cloud's
  pushMine: (key: string) => Promise<void>;             // connect with a key, overwrite cloud with local
  pullNow: () => Promise<void>;
  pushNow: () => Promise<void>;
  disconnect: () => void;
}

const Ctx = createContext<ListSyncValue | null>(null);
export function useListSync(): ListSyncValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useListSync must be used within <ListSyncProvider>');
  return c;
}

const serial = (l: unknown[]) => JSON.stringify(l ?? []);
function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  const o = e as Record<string, unknown> | null;
  return (o && typeof o.message === 'string' && o.message) || 'Sync failed — please try again.';
}

export function ListSyncProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = usePersistentState<unknown[]>('tow:lists', []);
  const [key, setKey] = usePersistentState<string | null>('tow:syncKey', null);
  const [syncAt, setSyncAt] = usePersistentState<string | null>('tow:syncAt', null);
  const [status, setStatus] = useState<Status>(key ? 'syncing' : 'off');
  const [error, setError] = useState<string | null>(null);

  const lastPushed = useRef<string | null>(null); // serialized lists known to match the cloud
  const ready = useRef(false);                    // gate auto-push until the first pull settles

  // On mount and whenever the key changes: reconcile with the cloud.
  useEffect(() => {
    let cancelled = false;
    if (!key) { setStatus('off'); ready.current = true; lastPushed.current = null; return; }
    ready.current = false;
    setStatus('syncing');
    (async () => {
      try {
        const cloud = await pullLists(key);
        if (cancelled) return;
        if (!cloud) {
          // key is new to the server — seed it from this device
          const ts = await pushLists(key, lists);
          if (cancelled) return;
          lastPushed.current = serial(lists);
          setSyncAt(ts);
        } else if (cloud.updatedAt !== syncAt && serial(cloud.lists) !== serial(lists)) {
          // another device changed the lists — adopt them
          lastPushed.current = serial(cloud.lists);
          setLists(cloud.lists);
          setSyncAt(cloud.updatedAt);
        } else {
          lastPushed.current = serial(lists);
          if (cloud.updatedAt !== syncAt) setSyncAt(cloud.updatedAt);
        }
        if (!cancelled) { setStatus('synced'); setError(null); }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setError(msg(e)); }
      } finally {
        ready.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push local changes (debounced) once the initial reconcile is done.
  useEffect(() => {
    if (!key || !ready.current) return;
    const s = serial(lists);
    if (s === lastPushed.current) return;
    const t = setTimeout(async () => {
      setStatus('syncing');
      try {
        const ts = await pushLists(key, lists);
        lastPushed.current = s;
        setSyncAt(ts);
        setStatus('synced'); setError(null);
      } catch (e) { setStatus('error'); setError(msg(e)); }
    }, 1200);
    return () => clearTimeout(t);
  }, [lists, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const createKey = useCallback(() => {
    const k = makeSyncKey();
    lastPushed.current = null; // force the mount effect to seed the cloud
    setKey(k);
    return k;
  }, [setKey]);

  const peek = useCallback((k: string) => pullLists(k), []);

  const adoptCloud = useCallback((k: string, cloud: CloudLists) => {
    lastPushed.current = serial(cloud.lists);
    setLists(cloud.lists);
    setSyncAt(cloud.updatedAt);
    setKey(k);
    setStatus('synced'); setError(null);
  }, [setLists, setSyncAt, setKey]);

  const pushMine = useCallback(async (k: string) => {
    setStatus('syncing');
    try {
      const ts = await pushLists(k, lists);
      lastPushed.current = serial(lists);
      setSyncAt(ts);
      setKey(k);
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); throw e; }
  }, [lists, setSyncAt, setKey]);

  const pullNow = useCallback(async () => {
    if (!key) return;
    setStatus('syncing');
    try {
      const cloud = await pullLists(key);
      if (cloud) { lastPushed.current = serial(cloud.lists); setLists(cloud.lists); setSyncAt(cloud.updatedAt); }
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }, [key, setLists, setSyncAt]);

  const pushNow = useCallback(async () => {
    if (!key) return;
    setStatus('syncing');
    try {
      const ts = await pushLists(key, lists);
      lastPushed.current = serial(lists);
      setSyncAt(ts);
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }, [key, lists, setSyncAt]);

  const disconnect = useCallback(() => {
    setKey(null);
    setSyncAt(null);
    setStatus('off'); setError(null);
  }, [setKey, setSyncAt]);

  const value = useMemo<ListSyncValue>(() => ({
    key, status, lastSyncedAt: syncAt, error, listCount: Array.isArray(lists) ? lists.length : 0,
    createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect,
  }), [key, status, syncAt, error, lists, createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
