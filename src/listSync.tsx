import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePersistentState } from './store';
import { accountSyncKey, makeSyncKey, pullLists, pushLists, type CloudLists } from './lib/listSync';
import { useAuth } from './lib/auth';

// Keeps `tow:lists` in sync across a player's devices:
//  • signed in → automatically, on a key derived from the account (nothing to set up);
//  • signed out → optionally, on a self-chosen sync password (the original no-login flow);
//  • on connect/open it pulls the cloud copy and adopts it if another device changed it,
//  • on every local change it pushes (debounced),
//  • last write wins (fine for a single player across their own devices).
//
// The automatic path matters for the campaign: Isle of Celedon reads a player's campaign list
// straight out of `tow_lists`, so a list that never reaches the cloud is invisible to it. Before
// 28-07-2026 that needed a sync password, which meant "signed in" was not enough to be coupled.

type Status = 'off' | 'syncing' | 'synced' | 'error';

interface ListSyncValue {
  key: string | null;
  /** True when syncing runs off the signed-in account rather than a typed password. */
  viaAccount: boolean;
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

const serial = (v: unknown) => JSON.stringify(v ?? []);
function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  const o = e as Record<string, unknown> | null;
  return (o && typeof o.message === 'string' && o.message) || 'Sync failed — please try again.';
}

export function ListSyncProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = usePersistentState<unknown[]>('tow:lists', []);
  const [groups, setGroups] = usePersistentState<unknown[]>('tow:list-groups', []);
  const [key, setKey] = usePersistentState<string | null>('tow:syncKey', null);
  const [viaAccount, setViaAccount] = usePersistentState<boolean>('tow:syncViaAccount', false);
  const [syncAt, setSyncAt] = usePersistentState<string | null>('tow:syncAt', null);
  const [status, setStatus] = useState<Status>(key ? 'syncing' : 'off');
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Signed in ⇒ sync, without asking anything. Only takes over when there is no key yet, so a player
  // who already synced with a password keeps that key (and their existing cloud lists) untouched.
  // If a DIFFERENT account signs in on a device that was syncing via an account, follow it — otherwise
  // the new player would silently write into the previous one's row.
  useEffect(() => {
    if (!user) return;
    const mine = accountSyncKey(user.id);
    if (!key) { setViaAccount(true); setKey(mine); return; }
    if (viaAccount && key !== mine) { setSyncAt(null); setKey(mine); }
  }, [user, key, viaAccount, setKey, setViaAccount, setSyncAt]);

  const lastPushed = useRef<string | null>(null); // combined lists+groups snapshot known to match the cloud
  const ready = useRef(false);                    // gate auto-push until the first pull settles
  // A combined snapshot of everything we sync (lists + group folders), for change detection.
  const snap = (l: unknown[], g: unknown[]) => serial({ l: l ?? [], g: g ?? [] });
  const localSnap = snap(lists, groups);

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
          const ts = await pushLists(key, lists, groups);
          if (cancelled) return;
          lastPushed.current = snap(lists, groups);
          setSyncAt(ts);
        } else if (cloud.updatedAt !== syncAt && snap(cloud.lists, cloud.groups) !== snap(lists, groups)) {
          // another device changed the lists/groups — adopt them
          lastPushed.current = snap(cloud.lists, cloud.groups);
          setLists(cloud.lists);
          setGroups(cloud.groups);
          setSyncAt(cloud.updatedAt);
        } else {
          // Baseline = what's actually in the cloud, so any local divergence (offline edits, or
          // groups the cloud doesn't have yet) gets pushed up by the auto-push effect.
          lastPushed.current = snap(cloud.lists, cloud.groups);
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
    if (localSnap === lastPushed.current) return;
    const t = setTimeout(async () => {
      setStatus('syncing');
      try {
        const ts = await pushLists(key, lists, groups);
        lastPushed.current = localSnap;
        setSyncAt(ts);
        setStatus('synced'); setError(null);
      } catch (e) { setStatus('error'); setError(msg(e)); }
    }, 1200);
    return () => clearTimeout(t);
  }, [localSnap, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const createKey = useCallback(() => {
    const k = makeSyncKey();
    lastPushed.current = null; // force the mount effect to seed the cloud
    setViaAccount(false);      // an explicitly chosen key wins over the account default
    setKey(k);
    return k;
  }, [setKey, setViaAccount]);

  const peek = useCallback((k: string) => pullLists(k), []);

  const adoptCloud = useCallback((k: string, cloud: CloudLists) => {
    lastPushed.current = snap(cloud.lists, cloud.groups);
    setLists(cloud.lists);
    setGroups(cloud.groups);
    setSyncAt(cloud.updatedAt);
    setViaAccount(false);
    setKey(k);
    setStatus('synced'); setError(null);
  }, [setLists, setGroups, setSyncAt, setKey, setViaAccount]);

  const pushMine = useCallback(async (k: string) => {
    setStatus('syncing');
    try {
      const ts = await pushLists(k, lists, groups);
      lastPushed.current = snap(lists, groups);
      setSyncAt(ts);
      setViaAccount(false);
      setKey(k);
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); throw e; }
  }, [lists, groups, setSyncAt, setKey, setViaAccount]);

  const pullNow = useCallback(async () => {
    if (!key) return;
    setStatus('syncing');
    try {
      const cloud = await pullLists(key);
      if (cloud) { lastPushed.current = snap(cloud.lists, cloud.groups); setLists(cloud.lists); setGroups(cloud.groups); setSyncAt(cloud.updatedAt); }
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }, [key, setLists, setGroups, setSyncAt]);

  const pushNow = useCallback(async () => {
    if (!key) return;
    setStatus('syncing');
    try {
      const ts = await pushLists(key, lists, groups);
      lastPushed.current = snap(lists, groups);
      setSyncAt(ts);
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }, [key, lists, groups, setSyncAt]);

  const disconnect = useCallback(() => {
    setKey(null);
    setViaAccount(false);
    setSyncAt(null);
    setStatus('off'); setError(null);
  }, [setKey, setViaAccount, setSyncAt]);

  const value = useMemo<ListSyncValue>(() => ({
    key, viaAccount: viaAccount && !!key, status, lastSyncedAt: syncAt, error,
    listCount: Array.isArray(lists) ? lists.length : 0,
    createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect,
  }), [key, viaAccount, status, syncAt, error, lists, createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
