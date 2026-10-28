import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPersisted, setPersisted, usePersistentState } from './store';
import { accountSyncKey, makeSyncKey, pullLists, pullVersion, pullVersions, pushLists, type CloudLists, type CloudVersie } from './lib/listSync';
import { mergeSync, zelfdeDoc, type SyncDoc } from './lib/listMerge';
import { useAuth } from './lib/auth';
import { testSwitchBezig } from './lib/testAccounts';

// Keeps `tow:lists` (and the group folders) the same on all of a player's devices:
//  • signed in → automatically, on a key derived from the account (nothing to set up);
//  • signed out → optionally, on a self-chosen sync password (the original no-login flow).
//
// The automatic path matters for the campaign: Isle of Celedon reads a player's campaign list
// straight out of `tow_lists`, so a list that never reaches the cloud is invisible to it. Before
// 28-07-2026 that needed a sync password, which meant "signed in" was not enough to be coupled.
//
// ── SAMENVOEGEN IN PLAATS VAN OVERSCHRIJVEN (28-10-2026) ────────────────────────────────────────
// Tot vandaag was dit "laatste schrijver wint" op het hele document, met een "which copy?"-dialoog
// als noodrem. Joost speelt op een PC en een telefoon en had er steeds last van: lijsten liepen
// achter, en de dialoog vroeg iets wat niemand kon beantwoorden ("gewoon altijd dezelfde lijsten").
// Drie oorzaken, alle drie hier opgelost:
//  1. Een verwijdering en een nieuwe lijst waren niet uit elkaar te houden (een id dat de cloud mist:
//     hier nieuw, of daar weggegooid?). Nu bewaart elk apparaat een BASIS (`tow:syncBase`): de laatste
//     stand waarvan vaststaat dat dit apparaat en de cloud hem allebei hadden. Daartegen voegt
//     lib/listMerge.ts per lijst samen — bewerkingen, nieuwe lijsten en verwijderingen van beide kanten
//     komen door, en bij een echte botsing wint de nieuwste bewerking van díe lijst. Geen dialoog meer.
//  2. Ophalen gebeurde alleen bij het openen. Een PWA die dagen openstaat op de telefoon bewerkte een
//     verouderde kopie. Nu ook bij terugkomen in de app (zichtbaar/focus), weer online, en elke minuut
//     zolang de app in beeld is.
//  3. De automatische push schreef blind over de cloud heen. Nu is er maar één weg naar de cloud:
//     `syncNu` — eerst ophalen, dan samenvoegen, dan pas (en alleen als het nodig is) pushen.

type Status = 'off' | 'syncing' | 'synced' | 'error';

/** De laatste stand die dit apparaat en de cloud allebei hadden, met de sleutel erbij: een basis van
 *  een ANDERE sleutel zegt niets over deze cloud-rij en telt als "geen basis". */
interface SyncBasis extends SyncDoc { key: string }
const BASIS = 'tow:syncBase';
/** ACCOUNTWISSEL (review 28-10-2026): gewoon uitloggen laat de lijsten op het apparaat staan. Logt er
 *  daarna een ANDER account in, dan zijn die lijsten van het vorige account (dat ze al in z'n eigen
 *  cloud-rij heeft). Samenvoegen zou ze in het nieuwe account zetten; vroeger hield de keuzedialoog dat
 *  tegen. Nu onthoudt deze sleutel dat de eerstvolgende ronde voor dat account de cloud OVERNEEMT. */
const OVERNAME = 'tow:syncOvername';

interface ListSyncValue {
  key: string | null;
  /** True when syncing runs off the signed-in account rather than a typed password. */
  viaAccount: boolean;
  status: Status;
  /** Server timestamp of the cloud copy as last seen/written — changes only when the cloud changes. */
  lastSyncedAt: string | null;
  /** When this device last confirmed it matches the cloud (ms), also when nothing changed. */
  lastCheckedAt: number | null;
  error: string | null;
  listCount: number;
  createKey: () => string;                              // generate a key + push local lists
  peek: (key: string) => Promise<CloudLists | null>;    // look at a key's cloud lists before deciding
  adoptCloud: (key: string, cloud: CloudLists) => void; // replace local lists with the cloud's
  pushMine: (key: string) => Promise<void>;             // connect with a key, overwrite cloud with local
  /** "Make sure the cloud has my lists now": een volledige sync (ophalen, samenvoegen, pushen).
   *  Resolvet als hij klaar is; gooit niet (een fout staat in `status`/`error`). */
  pushNow: () => Promise<void>;
  /** Expliciet: dit apparaat := de cloud. Lokale wijzigingen die er nog niet waren, vervallen. */
  pullNow: () => Promise<void>;
  /** Expliciet: de cloud := dit apparaat. Wat alleen in de cloud stond, vervalt (en staat in de versies). */
  overwriteCloud: () => Promise<void>;
  disconnect: () => void;
  /** De bewaarde eerdere versies van deze sleutel, nieuwste eerst. */
  versies: () => Promise<CloudVersie[]>;
  /** Zet een bewaarde versie terug — hier én in de cloud, zodat je andere apparaten hem ook krijgen. */
  herstelVersie: (id: number) => Promise<void>;
  /** Stap over op de sleutel van het ingelogde account. Null als er niemand is ingelogd. */
  useAccountKey: (() => void) | null;
}

const Ctx = createContext<ListSyncValue | null>(null);
export function useListSync(): ListSyncValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useListSync must be used within <ListSyncProvider>');
  return c;
}

const serial = (v: unknown) => JSON.stringify(v ?? []);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  const o = e as Record<string, unknown> | null;
  return (o && typeof o.message === 'string' && o.message) || 'Sync failed — please try again.';
}

// Alles wat een sync-ronde leest, leest hij ACTUEEL uit de store (niet uit de render-closure): een
// ronde wacht op het netwerk, en in die tijd kan de speler gewoon doorbouwen of van sleutel wisselen.
const sleutelNu = () => getPersisted<string | null>('tow:syncKey', null);
const lokaalNu = (): SyncDoc => ({
  lists: arr(getPersisted<unknown[]>('tow:lists', [])),
  groups: arr(getPersisted<unknown[]>('tow:list-groups', [])),
});
function basisVoor(k: string): SyncDoc | null {
  const b = getPersisted<SyncBasis | null>(BASIS, null);
  return b && b.key === k ? { lists: arr(b.lists), groups: arr(b.groups) } : null;
}

/** Een Postgres-tijdstempel als ms. Op tijd vergelijken, niet op tekst: de push-RPC en de pull kunnen
 *  hetzelfde moment verschillend opschrijven ("2026-10-28 10:00:00+00" vs "2026-10-28T10:00:00+00:00"). */
function serverTijd(s: string | null | undefined): number {
  if (!s) return NaN;
  return Date.parse(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
}

/** Eenmalig, bij de overstap op samenvoegen (28-10-2026): een apparaat dat nog geen basis heeft maar
 *  wel een `tow:syncAt` van de oude sync. Die tijd hoort bij een cloud-stand die dit apparaat toen
 *  precies had (de oude sync zette hem alleen na een push of na het overnemen). Is de cloud sindsdien
 *  niet veranderd, dan IS de cloud de basis; anders staat die stand in de bewaarde versies, met
 *  `was_updated_at` = die tijd. Zonder dit zou de eerste ronde na de update alles samenvoegen, en
 *  kwamen lijsten die op de PC al weg waren via een achterlopende telefoon terug. Lukt het niet
 *  (versie weggesnoeid, offline): null, en dan wordt er samengevoegd — er gaat niets verloren. */
async function basisUitOudeSync(k: string, cloud: CloudLists): Promise<SyncDoc | null> {
  const toen = serverTijd(getPersisted<string | null>('tow:syncAt', null));
  if (!Number.isFinite(toen)) return null;
  if (serverTijd(cloud.updatedAt) === toen) return { lists: arr(cloud.lists), groups: arr(cloud.groups) };
  try {
    const v = (await pullVersions(k)).find((x) => serverTijd(x.wasUpdatedAt) === toen);
    if (!v) return null;
    const doc = await pullVersion(k, v.id);
    return doc ? { lists: arr(doc.lists), groups: arr(doc.groups) } : null;
  } catch {
    return null;
  }
}

/** Hoe lang een trigger van buiten (focus, zichtbaar, online, de minuut-tik) wacht na een geslaagde
 *  ronde. Focus en zichtbaar vuren vaak samen; twee keer ophalen voegt niets toe. */
const RUST_MS = 5000;

export function ListSyncProvider({ children }: { children: ReactNode }) {
  const [lists, setLists] = usePersistentState<unknown[]>('tow:lists', []);
  const [groups, setGroups] = usePersistentState<unknown[]>('tow:list-groups', []);
  const [key, setKey] = usePersistentState<string | null>('tow:syncKey', null);
  const [viaAccount, setViaAccount] = usePersistentState<boolean>('tow:syncViaAccount', false);
  const [syncAt, setSyncAt] = usePersistentState<string | null>('tow:syncAt', null);
  const [, setBasis] = usePersistentState<SyncBasis | null>(BASIS, null);
  const [status, setStatus] = useState<Status>(key ? 'syncing' : 'off');
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const { user } = useAuth();

  // Signed in ⇒ sync, without asking anything. Only takes over when there is no key yet, so a player
  // who already synced with a password keeps that key (and their existing cloud lists) untouched.
  // If a DIFFERENT account signs in on a device that was syncing via an account, follow it — otherwise
  // the new player would silently write into the previous one's row.
  useEffect(() => {
    if (!user) return;
    const mine = accountSyncKey(user.id);
    if (!key) { setViaAccount(true); setKey(mine); return; }
    if (viaAccount && key !== mine) { setSyncAt(null); setPersisted<string | null>(OVERNAME, mine); setKey(mine); }
  }, [user, key, viaAccount, setKey, setViaAccount, setSyncAt]);

  // ── Eén rij, nooit twee tegelijk ─────────────────────────────────────────────────────────────────
  // Elke handeling die de cloud of de lokale lijsten raakt loopt via `inRij`, achter elkaar. Twee
  // rondes door elkaar zouden elk een andere basis bewaren en elkaars push overschrijven.
  const keten = useRef<Promise<unknown>>(Promise.resolve());
  const inRij = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = keten.current.then(fn);
    keten.current = p.catch(() => undefined);
    return p;
  }, []);
  /** Een sync-ronde die al in de rij staat maar nog niet begonnen is. Komt er dan nog een trigger,
   *  dan hoeft er geen tweede bij: die wachtende ronde leest bij zijn start toch de nieuwste staat. */
  const wachtend = useRef<Promise<void> | null>(null);
  const loopt = useRef(false);
  const laatsteCheck = useRef(0);
  /** Sleutels waarvoor deze sessie de opsplitsing al (opnieuw) is meegestuurd — zie de backfill. */
  const opgesplitst = useRef<Set<string>>(new Set());

  const klaar = useCallback((k: string, doc: SyncDoc, ts: string) => {
    setBasis({ key: k, lists: doc.lists, groups: doc.groups });
    setSyncAt(ts);
    laatsteCheck.current = Date.now();
    setLastCheckedAt(laatsteCheck.current);
    setStatus('synced'); setError(null);
  }, [setBasis, setSyncAt]);

  /** Eén volledige ronde: ophalen → samenvoegen → (zo nodig) lokaal bijwerken → (zo nodig) pushen. */
  const ronde = useCallback(async (): Promise<void> => {
    const k = sleutelNu();
    if (!k) { setStatus('off'); return; }
    // Middenin een testaccount-wissel: de lokale lijsten zijn dan al gewist en de sleutel is al van
    // het nieuwe account. Zou de seed-tak hier lopen, dan kreeg het nieuwe account de lijsten van het
    // vorige. De wissel herlaadt de pagina, dus deze verzoening gebeurt zo meteen alsnog — schoon.
    if (testSwitchBezig()) return;
    // Een achtergrondcontrole laat "Synced" gewoon staan; pas als er echt gepusht wordt, zie je het.
    // Anders knippert de status elke minuut en springen de effecten die op 'synced' wachten mee.
    setStatus((s) => (s === 'synced' ? s : 'syncing'));
    try {
      const cloud = await pullLists(k);
      if (sleutelNu() !== k || testSwitchBezig()) return;
      if (getPersisted<string | null>(OVERNAME, null) === k) {
        // Ander account op dit apparaat: neem z'n cloud over (of begin leeg), niets samenvoegen.
        setPersisted<string | null>(OVERNAME, null);
        const doc: SyncDoc = cloud ? { lists: arr(cloud.lists), groups: arr(cloud.groups) } : { lists: [], groups: [] };
        setLists(doc.lists);
        setGroups(doc.groups);
        if (cloud) { klaar(k, doc, cloud.updatedAt); return; }
        setBasis({ key: k, lists: [], groups: [] });
        setStatus('synced'); setError(null);
        return;
      }
      let basis = basisVoor(k);
      if (cloud && !basis) {
        basis = await basisUitOudeSync(k, cloud);
        if (sleutelNu() !== k || testSwitchBezig()) return;
      }
      // Pas NA het wachten lezen: wat de speler intussen deed, hoort erbij.
      const lokaal = lokaalNu();
      if (!cloud) {
        // key is new to the server — seed it from this device
        setStatus('syncing');
        const ts = await pushLists(k, lokaal.lists, lokaal.groups);
        opgesplitst.current.add(k);
        if (sleutelNu() !== k) return;
        klaar(k, lokaal, ts);
        return;
      }
      const samen = mergeSync(basis, lokaal, { lists: arr(cloud.lists), groups: arr(cloud.groups) });
      // Lokaal bijwerken gebeurt METEEN (synchroon na het lezen), niet na de push: anders zou een
      // bewerking die de speler tijdens de push maakt door deze uitkomst overschreven worden.
      if (!zelfdeDoc(samen, lokaal)) { setLists(samen.lists); setGroups(samen.groups); }
      let ts = cloud.updatedAt;
      if (!zelfdeDoc(samen, cloud)) {
        setStatus('syncing');
        ts = await pushLists(k, samen.lists, samen.groups);
        opgesplitst.current.add(k);
      } else if (!opgesplitst.current.has(k)) {
        // Backfill (30-07): een rij die door een oudere build gepusht is heeft nog geen
        // campagne-opsplitsing (punten + opties per unit). Minder opsplitsingen dan lijsten → één keer
        // opnieuw pushen; de lijsten zelf veranderen daarbij niet.
        // Of (22-09-2026): de opsplitsing komt van een ANDERE app-versie. De `fouten` erin zijn het
        // oordeel van de validator van toen; is die intussen gerepareerd of aangescherpt, dan
        // blokkeert de campagne op iets wat deze app niet meer (of juist wel) zegt.
        // Eén poging per sleutel per sessie (28-10): de sync draait nu elke minuut, en een lijst die
        // nooit een opsplitsing krijgt zou anders elke minuut een push (en een versie) kosten.
        const n = arr(cloud.lists).length;
        const verouderd = n > 0 && cloud.renderedVersie !== __APP_VERSION__;
        if (n > cloud.renderedCount || verouderd) {
          opgesplitst.current.add(k);
          try { ts = await pushLists(k, samen.lists, samen.groups); }
          catch { /* stil: de lijsten zelf staan al goed in de cloud */ }
        }
      }
      if (sleutelNu() !== k) return;
      klaar(k, samen, ts);
    } catch (e) {
      if (sleutelNu() === k) { setStatus('error'); setError(msg(e)); }
    }
  }, [klaar, setLists, setGroups, setBasis]);

  /** De enige weg waarlangs de app vanzelf synct. Komt er een trigger terwijl er een ronde loopt, dan
   *  volgt er precies één ronde daarna — nooit twee tegelijk, en geen stapel. */
  const syncNu = useCallback((): Promise<void> => {
    if (wachtend.current) return wachtend.current;
    const p = inRij(async () => {
      wachtend.current = null;
      loopt.current = true;
      try { await ronde(); } finally { loopt.current = false; }
    });
    wachtend.current = p;
    return p;
  }, [inRij, ronde]);

  // Snapshot of everything we sync, only for change DETECTION (cheap). Wat er echt veranderd is,
  // beslist de ronde zelf tegen de basis.
  const localSnap = serial({ l: lists ?? [], g: groups ?? [] });

  // Trigger 1: on mount and whenever the key changes.
  useEffect(() => {
    if (testSwitchBezig()) return;
    if (!key) { setStatus('off'); return; }
    void syncNu();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger 2: a local change (debounced). Geen blinde push meer: ook dit is een volledige ronde.
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => {
      if (testSwitchBezig()) return; // accountwissel loopt — niet met halve staat naar de cloud
      // Is dit precies de stand die al in de basis staat (bv. net door een ronde zelf neergezet)?
      // Dan valt er hier niets te melden.
      const b = basisVoor(key);
      if (b && zelfdeDoc(lokaalNu(), b)) return;
      void syncNu();
    }, 1200);
    return () => clearTimeout(t);
  }, [localSnap, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger 3: terug in de app, weer online, en elke minuut zolang hij in beeld is. Dit is wat een
  // telefoon-PWA die dagen openstaat bij de les houdt.
  useEffect(() => {
    if (!key) return;
    const controleer = () => {
      if (testSwitchBezig()) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (loopt.current || wachtend.current) return;
      if (Date.now() - laatsteCheck.current < RUST_MS) return;
      void syncNu();
    };
    const zichtbaar = () => { if (document.visibilityState === 'visible') controleer(); };
    document.addEventListener('visibilitychange', zichtbaar);
    window.addEventListener('focus', controleer);
    window.addEventListener('online', controleer);
    const tik = window.setInterval(controleer, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', zichtbaar);
      window.removeEventListener('focus', controleer);
      window.removeEventListener('online', controleer);
      window.clearInterval(tik);
    };
  }, [key, syncNu]);

  const createKey = useCallback(() => {
    const k = makeSyncKey();
    setViaAccount(false);      // an explicitly chosen key wins over the account default
    setKey(k);                 // de basis hoort bij een andere sleutel → telt als geen; de ronde seedt
    return k;
  }, [setKey, setViaAccount]);

  const peek = useCallback((k: string) => pullLists(k), []);

  const adoptCloud = useCallback((k: string, cloud: CloudLists) => {
    setLists(cloud.lists);
    setGroups(cloud.groups);
    // Dit apparaat is nu precies de cloud: dat is de basis voor deze sleutel.
    setBasis({ key: k, lists: arr(cloud.lists), groups: arr(cloud.groups) });
    setSyncAt(cloud.updatedAt);
    setViaAccount(false);
    setKey(k);
    setStatus('synced'); setError(null);
  }, [setLists, setGroups, setBasis, setSyncAt, setKey, setViaAccount]);

  const pushMine = useCallback((k: string) => inRij(async () => {
    setStatus('syncing');
    try {
      const lokaal = lokaalNu();
      const ts = await pushLists(k, lokaal.lists, lokaal.groups);
      opgesplitst.current.add(k);
      // Basis vóór de sleutel: de ronde die de sleutelwissel straks start, ziet dan meteen dat er
      // niets te doen is.
      setBasis({ key: k, lists: lokaal.lists, groups: lokaal.groups });
      setSyncAt(ts);
      setViaAccount(false);
      setKey(k);
      setStatus('synced'); setError(null);
    } catch (e) { setStatus('error'); setError(msg(e)); throw e; }
  }), [inRij, setBasis, setSyncAt, setKey, setViaAccount]);

  /** "Replace this device with the cloud" — bewust en op eigen verzoek. Sinds het samenvoegen
   *  (28-10) zelden nodig; het blijft als noodgreep, bv. als je op dit apparaat iets hebt verknoeid. */
  const pullNow = useCallback(() => inRij(async () => {
    const k = sleutelNu();
    if (!k) return;
    setStatus('syncing');
    try {
      const cloud = await pullLists(k);
      if (sleutelNu() !== k) return;
      if (!cloud) { setStatus('synced'); setError(null); return; } // niets in de cloud: niets te vervangen
      const doc = { lists: arr(cloud.lists), groups: arr(cloud.groups) };
      setLists(doc.lists);
      setGroups(doc.groups);
      klaar(k, doc, cloud.updatedAt);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }), [inRij, klaar, setLists, setGroups]);

  /** "Replace cloud with this device" — de tegenhanger. Wat alleen in de cloud stond gaat eruit; de
   *  server bewaart de vervangen versie, dus het is terug te halen via Earlier versions. */
  const overwriteCloud = useCallback(() => inRij(async () => {
    const k = sleutelNu();
    if (!k) return;
    setStatus('syncing');
    try {
      const lokaal = lokaalNu();
      const ts = await pushLists(k, lokaal.lists, lokaal.groups);
      opgesplitst.current.add(k);
      if (sleutelNu() !== k) return;
      klaar(k, lokaal, ts);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }), [inRij, klaar]);

  /** "Sync now", en wat CeledonPanel/ListBuilder aanroepen om zeker te weten dat een campagnelijst in
   *  de cloud staat. Vroeger een blinde push (en daarmee de derde oorzaak van het gedoe); nu een
   *  gewone ronde. Zelfde naam en belofte: resolvet als het klaar is. */
  const pushNow = useCallback(() => syncNu(), [syncNu]);

  const disconnect = useCallback(() => {
    setKey(null);
    setViaAccount(false);
    setSyncAt(null);
    // Ook de basis weg: wie later weer koppelt, begint met samenvoegen (er gaat niets verloren) in
    // plaats van alles wat hier intussen verdween als "verwijderd" naar de cloud te sturen.
    setBasis(null);
    setPersisted<string | null>(OVERNAME, null);
    setStatus('off'); setError(null);
  }, [setKey, setViaAccount, setSyncAt, setBasis]);

  const versies = useCallback(async (): Promise<CloudVersie[]> => {
    if (!key) return [];
    return pullVersions(key);
  }, [key]);

  /** Een bewaarde versie terugzetten.
   *
   *  Hij gaat NIET alleen lokaal terug: hij wordt ook meteen gepusht, en wordt de basis. Anders zou de
   *  volgende ronde de huidige cloud er weer overheen leggen en was het herstel zo weer weg. */
  const herstelVersie = useCallback((id: number) => inRij(async () => {
    const k = sleutelNu();
    if (!k) return;
    setStatus('syncing');
    try {
      const v = await pullVersion(k, id);
      if (!v) { setStatus('error'); setError('That version is no longer available.'); return; }
      const doc = { lists: arr(v.lists), groups: arr(v.groups) };
      const ts = await pushLists(k, doc.lists, doc.groups);
      opgesplitst.current.add(k);
      if (sleutelNu() !== k) return;
      setLists(doc.lists);
      setGroups(doc.groups);
      klaar(k, doc, ts);
    } catch (e) { setStatus('error'); setError(msg(e)); }
  }), [inRij, klaar, setLists, setGroups]);

  /** Handmatig overstappen naar de accountsleutel.
   *
   *  Inloggen doet dit NIET uit zichzelf: een zelfgekozen wachtwoord-sleutel wint, zodat je bestaande
   *  cloud-lijsten niet onder je vandaan verdwijnen omdat je toevallig inlogt. Keerzijde is dat een
   *  telefoon die ooit een wachtwoord kreeg voor altijd op die sleutel blijft, ook na uit- en weer
   *  inloggen — je account-lijsten komen dan nooit binnen (Joost 02-08). Vandaar deze bewuste stap.
   *  De basis hoort bij de oude sleutel, dus de eerste ronde op de accountsleutel voegt alles samen:
   *  de lijsten van dit apparaat en die van het account blijven allebei. */
  const useAccountKey = useCallback(() => {
    if (!user) return;
    setViaAccount(true);
    setSyncAt(null);
    setKey(accountSyncKey(user.id));
  }, [user, setViaAccount, setSyncAt, setKey]);

  const value = useMemo<ListSyncValue>(() => ({
    key, viaAccount: viaAccount && !!key, status, lastSyncedAt: syncAt, lastCheckedAt, error,
    listCount: Array.isArray(lists) ? lists.length : 0,
    createKey, peek, adoptCloud, pushMine, pullNow, pushNow, overwriteCloud, disconnect,
    versies, herstelVersie,
    useAccountKey: user ? useAccountKey : null,
  }), [key, viaAccount, status, syncAt, lastCheckedAt, error, lists, createKey, peek, adoptCloud, pushMine, pullNow, pushNow, overwriteCloud, disconnect, versies, herstelVersie, user, useAccountKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
