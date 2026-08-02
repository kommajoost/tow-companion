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

type Status = 'off' | 'syncing' | 'synced' | 'error' | 'conflict';

/** Een naam van een lijst, voor de botsings-dialoog. */
export interface SyncConflict {
  key: string;
  cloud: CloudLists;
  /** Namen van lijsten die HIER staan en niet in de cloud — precies wat je kwijt zou raken. */
  verdwijnen: string[];
  /** Aantal lijsten op dit apparaat / in de cloud. */
  hier: number;
  daar: number;
}

/** De id's van een lijst-array (dezelfde `id` die de app zelf gebruikt). */
const lijstIds = (v: unknown[]): Set<string> => {
  const s = new Set<string>();
  for (const l of Array.isArray(v) ? v : []) {
    const id = l && typeof l === 'object' ? (l as { id?: unknown }).id : null;
    if (typeof id === 'string' && id) s.add(id);
  }
  return s;
};
const telLijsten = (v: unknown[]): number => (Array.isArray(v) ? v.length : 0);

/** Namen van lijsten die in `mijn` zitten maar niet in `hun` — op id vergeleken, niet op inhoud, want
 *  een elders bewerkte lijst is geen verlies en moet gewoon doorlopen. */
function ontbrekendeLijsten(mijn: unknown[], hun: unknown[]): string[] {
  const daar = lijstIds(hun);
  const uit: string[] = [];
  for (const l of Array.isArray(mijn) ? mijn : []) {
    if (!l || typeof l !== 'object') continue;
    const { id, name } = l as { id?: unknown; name?: unknown };
    if (typeof id !== 'string' || !id || daar.has(id)) continue;
    uit.push(typeof name === 'string' && name.trim() ? name : 'Naamloze lijst');
  }
  return uit;
}

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
  /** Stap over op de sleutel van het ingelogde account. Null als er niemand is ingelogd. */
  useAccountKey: (() => void) | null;
  /** Open botsing: de cloud zou lijsten wegnemen die hier staan. Niets synct tot dit beantwoord is. */
  conflict: SyncConflict | null;
  /** 'cloud' = neem de cloudversie over; 'hier' = houd dit apparaat en schrijf dat naar de cloud. */
  resolveConflict: (keuze: 'cloud' | 'hier') => Promise<void>;
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

  // ── Botsing: de cloud zou lijsten wegnemen die dit apparaat wél heeft ────────────────────────────
  // Tot 02-08 nam het ophalen de cloud ALTIJD stil over. Meestal klopt dat — de cloud is de
  // gedeelde waarheid — maar één keer niet: een apparaat met lijsten dat voor het eerst een sleutel
  // krijgt (bv. door in te loggen) zag z'n eigen werk zonder één woord verdwijnen. En omdat de push
  // last-write-wins is en de server geen geschiedenis bijhield, was dat definitief.
  //
  // Alleen dát geval wordt nu voorgelegd: lijsten die LOKAAL bestaan en in de cloud ontbreken
  // (vergeleken op id, niet op inhoud). Alle andere verschillen — de cloud is nieuwer, heeft er juist
  // eentje bij, of een lijst is elders bewerkt — lopen door zoals altijd. Anders zou elke gewone
  // bewerking op een tweede apparaat een dialoog opleveren en leert iedereen 'm wegklikken.
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  /** Staat er een onbeantwoorde botsing? Dan mag NIETS pushen tot de speler gekozen heeft. */
  const geblokkeerd = useRef(false);
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
          // another device changed the lists/groups — adopt them, UNLESS that would drop lists this
          // device has and the cloud does not. Then we stop and ask: keeping quiet here is what made
          // a whole evening's work vanish. `ready` stays false so the auto-push cannot fire either —
          // neither side overwrites the other while the question is open.
          const weg = ontbrekendeLijsten(lists, cloud.lists);
          if (weg.length) {
            setConflict({ key, cloud, verdwijnen: weg, hier: telLijsten(lists), daar: telLijsten(cloud.lists) });
            setStatus('conflict');
            // Grendel, geen `return`: een return voert `finally` alsnog uit en zet `ready` op true,
            // waarna de auto-push dit apparaat over de cloud heen zou schrijven — precies de andere
            // helft van hetzelfde ongeluk. Zolang deze ref staat doet de push-effect niets.
            geblokkeerd.current = true;
            return;
          }
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
        // Backfill (30-07): een rij die door een oudere build gepusht is heeft nog geen
        // campagne-opsplitsing (punten + opties per unit). Zonder deze eenmalige push zou de campagne
        // daarop moeten wachten tot de speler toevallig z'n lijst wijzigt. Draait alleen als er
        // campagne-lijsten zijn en verandert de lijsten zelf niet.
        if (cloud && !cancelled) {
          // Minder opsplitsingen dan lijsten → een oudere build vulde deze rij (of hij is nooit gevuld).
          // Eén keer opnieuw pushen; de lijsten zelf veranderen daarbij niet.
          if ((cloud.lists ?? []).length > cloud.renderedCount) {
            try {
              const ts = await pushLists(key, cloud.lists, cloud.groups);
              if (!cancelled) { lastPushed.current = snap(cloud.lists, cloud.groups); setSyncAt(ts); }
            } catch { /* stil: de lijsten zelf staan al goed in de cloud */ }
          }
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
    if (geblokkeerd.current) return; // onbeantwoorde botsing — niets overschrijven
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

  /** Beantwoord de botsing. Pas hierna gaat de grendel eraf, zodat de keuze niet alsnog door een
   *  wachtende auto-push wordt ingehaald. */
  const resolveConflict = useCallback(async (keuze: 'cloud' | 'hier') => {
    const c = conflict;
    if (!c) return;
    setStatus('syncing');
    try {
      if (keuze === 'cloud') {
        lastPushed.current = snap(c.cloud.lists, c.cloud.groups);
        setLists(c.cloud.lists);
        setGroups(c.cloud.groups);
        setSyncAt(c.cloud.updatedAt);
      } else {
        const ts = await pushLists(c.key, lists, groups);
        lastPushed.current = snap(lists, groups);
        setSyncAt(ts);
      }
      setConflict(null);
      geblokkeerd.current = false;
      ready.current = true;
      setStatus('synced'); setError(null);
    } catch (e) {
      setStatus('error'); setError(msg(e));
    }
  }, [conflict, lists, groups, setLists, setGroups, setSyncAt]);

  /** Handmatig overstappen naar de accountsleutel.
   *
   *  Inloggen doet dit NIET uit zichzelf: een zelfgekozen wachtwoord-sleutel wint, zodat je bestaande
   *  cloud-lijsten niet onder je vandaan verdwijnen omdat je toevallig inlogt. Keerzijde is dat een
   *  telefoon die ooit een wachtwoord kreeg voor altijd op die sleutel blijft, ook na uit- en weer
   *  inloggen — je account-lijsten komen dan nooit binnen (Joost 02-08). Vandaar deze bewuste stap.
   *  De pull erna beslist zelf of er iets zou verdwijnen en vraagt het dan. */
  const useAccountKey = useCallback(() => {
    if (!user) return;
    setViaAccount(true);
    setSyncAt(null);            // forceer een verse vergelijking met de cloud
    setKey(accountSyncKey(user.id));
  }, [user, setViaAccount, setSyncAt, setKey]);

  const value = useMemo<ListSyncValue>(() => ({
    key, viaAccount: viaAccount && !!key, status, lastSyncedAt: syncAt, error,
    listCount: Array.isArray(lists) ? lists.length : 0,
    createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect,
    useAccountKey: user ? useAccountKey : null,
    conflict, resolveConflict,
  }), [key, viaAccount, status, syncAt, error, lists, createKey, peek, adoptCloud, pushMine, pullNow, pushNow, disconnect, user, useAccountKey, conflict, resolveConflict]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
